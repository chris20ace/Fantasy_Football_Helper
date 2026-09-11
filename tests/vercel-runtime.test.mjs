import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const repo = new URL('../', import.meta.url);
const runtimeSource = stripTypeScriptTypes(
  await readFile(new URL('lib/platform/vercel.ts', repo), 'utf8'),
).replace(
  /^import[^\n]+from '@vercel\/blob';\r?\n/,
  'const { get, put, BlobPreconditionFailedError } = globalThis.__blobMock;\n',
);
const authSource = stripTypeScriptTypes(
  await readFile(new URL('lib/platform/vercel-auth.ts', repo), 'utf8'),
).replace(
  /^import[^\n]+from 'next\/headers';\r?\n/,
  'const { headers } = globalThis.__headersMock;\n',
);
let serial = 0;
async function load(source) {
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(source + '\n// module ' + ++serial).toString('base64')
  );
}
function mockStore(initial, race = false) {
  let row = initial ? { ...initial } : null;
  let readCount = 0,
    etagVersion = 1,
    unlock;
  const gate = new Promise((resolve) => (unlock = resolve));
  const calls = [];
  class BlobPreconditionFailedError extends Error {}
  return {
    calls,
    current: () => row,
    BlobPreconditionFailedError,
    async get(path, options) {
      calls.push({ method: 'get', path, options });
      const snapshot = row ? { ...row } : null;
      if (race && ++readCount <= 2) {
        if (readCount === 2) unlock();
        await gate;
      }
      return snapshot
        ? {
            statusCode: 200,
            stream: new Blob([snapshot.body]).stream(),
            blob: { etag: snapshot.etag },
          }
        : null;
    },
    async put(path, body, options) {
      calls.push({ method: 'put', path, options });
      if (options.ifMatch && row?.etag !== options.ifMatch)
        throw new BlobPreconditionFailedError();
      if (row && !options.allowOverwrite)
        throw new Error('Blob already exists');
      row = { body, etag: 'etag-' + ++etagVersion };
      return { etag: row.etag };
    },
  };
}
function setEnv(values) {
  const before = {};
  for (const [key, value] of Object.entries(values)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(before))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  };
}
test('initial creation race retains exactly one writer and reports one conflict', async () => {
  const restore = setEnv({ VERCEL_ENV: 'production' });
  try {
    globalThis.__blobMock = mockStore(null, true);
    const runtime = await load(runtimeSource);
    const values = [
      { notes: { a: 'first device' }, reviewed: {} },
      { notes: { a: 'second device' }, reviewed: {} },
    ];
    const result = await Promise.all(
      values.map((value) => runtime.putPreferences('owner', value, 0)),
    );
    assert.equal(result.filter((v) => v === 1).length, 1);
    assert.equal(result.filter((v) => v === null).length, 1);
    const winner = result.indexOf(1);
    assert.equal(JSON.parse(globalThis.__blobMock.current().body).updated, 1);
    assert.deepEqual(
      JSON.parse(JSON.parse(globalThis.__blobMock.current().body).value),
      values[winner],
    );
    assert.ok(
      globalThis.__blobMock.calls
        .filter((c) => c.method === 'put')
        .every((c) => c.options.allowOverwrite === false),
    );
  } finally {
    restore();
  }
});
test('ETag update race preserves exactly one update and returns conflict to the other', async () => {
  const restore = setEnv({ VERCEL_ENV: 'production' });
  try {
    globalThis.__blobMock = mockStore(
      {
        body: JSON.stringify({
          value: JSON.stringify({ notes: {}, reviewed: {} }),
          updated: 4,
        }),
        etag: 'old-etag',
      },
      true,
    );
    const runtime = await load(runtimeSource);
    const values = [
      { notes: { a: 'first device' }, reviewed: {} },
      { notes: { a: 'second device' }, reviewed: {} },
    ];
    const result = await Promise.all(
      values.map((value) => runtime.putPreferences('owner', value, 4)),
    );
    assert.equal(result.filter((v) => v === 5).length, 1);
    assert.equal(result.filter((v) => v === null).length, 1);
    assert.deepEqual(
      JSON.parse(JSON.parse(globalThis.__blobMock.current().body).value),
      values[result.indexOf(5)],
    );
    assert.ok(
      globalThis.__blobMock.calls
        .filter((c) => c.method === 'put')
        .every((c) => c.options.ifMatch === 'old-etag'),
    );
    assert.ok(
      globalThis.__blobMock.calls
        .filter((c) => c.method === 'get')
        .every(
          (c) => c.options.useCache === false && c.options.access === 'private',
        ),
    );
  } finally {
    restore();
  }
});
test('stale revision is rejected without issuing a write', async () => {
  globalThis.__blobMock = mockStore({
    body: JSON.stringify({ value: '{}', updated: 9 }),
    etag: 'etag-9',
  });
  const runtime = await load(runtimeSource);
  assert.equal(
    await runtime.putPreferences('owner', { notes: {}, reviewed: {} }, 8),
    null,
  );
  assert.equal(
    globalThis.__blobMock.calls.filter((c) => c.method === 'put').length,
    0,
  );
});
test('a storage failure propagates instead of reporting a successful first save', async () => {
  globalThis.__blobMock = mockStore(null);
  globalThis.__blobMock.put = async () => {
    throw new Error('Storage unavailable');
  };
  const runtime = await load(runtimeSource);
  await assert.rejects(
    runtime.putPreferences('owner', { notes: {}, reviewed: {} }, 0),
    /Storage unavailable/,
  );
});
test('all writes remain private and preview uses a distinct namespace', async () => {
  const restore = setEnv({ VERCEL_ENV: 'preview' });
  try {
    globalThis.__blobMock = mockStore(null);
    const runtime = await load(runtimeSource);
    await runtime.saveCache('state/nfl', { value: 'sample' });
    const call = globalThis.__blobMock.calls.find((c) => c.method === 'put');
    assert.match(call.path, /^sunday-desk\/preview\/cache\/state%2Fnfl\.json$/);
    assert.equal(call.options.access, 'private');
  } finally {
    restore();
  }
});
test('auth rejects absent configuration and spoofed identity headers', async () => {
  const restore = setEnv({ VERCEL: undefined, DASHBOARD_AUTH_MODE: undefined });
  try {
    let headerCalls = 0;
    globalThis.__headersMock = {
      headers: async () => {
        headerCalls++;
        return new Headers({
          'oai-authenticated-user-id': 'attacker',
          'oai-authenticated-user-email': 'attacker@example.test',
        });
      },
    };
    const auth = await load(authSource);
    assert.equal(await auth.getChatGPTUser(), null);
    assert.equal(headerCalls, 1);
    await assert.rejects(auth.requireChatGPTUser('/'), /not configured/);
    process.env.VERCEL = '1';
    assert.equal(await auth.getChatGPTUser(), null);
    delete process.env.VERCEL;
    process.env.DASHBOARD_AUTH_MODE = 'vercel-protection';
    assert.equal(await auth.getChatGPTUser(), null);
  } finally {
    restore();
  }
});
test('configured protected deployment resolves one owner without trusting caller identity', async () => {
  const restore = setEnv({
    VERCEL: '1',
    DASHBOARD_AUTH_MODE: 'vercel-protection',
  });
  try {
    globalThis.__headersMock = {
      headers: async () =>
        new Headers({ 'oai-authenticated-user-id': 'attacker' }),
    };
    const auth = await load(authSource);
    assert.equal((await auth.getChatGPTUser()).userId, 'owner');
  } finally {
    restore();
  }
});

test('development never shares production storage and unknown environments fail closed', async () => {
  const restore = setEnv({ VERCEL_ENV: undefined });
  try {
    globalThis.__blobMock = mockStore(null);
    const runtime = await load(runtimeSource);
    await runtime.saveCache('state', {});
    assert.match(
      globalThis.__blobMock.calls[0].path,
      /^sunday-desk\/development\//,
    );
    process.env.VERCEL_ENV = 'invalid';
    await assert.rejects(
      runtime.saveCache('state', {}),
      /Unknown storage environment/,
    );
  } finally {
    restore();
  }
});
