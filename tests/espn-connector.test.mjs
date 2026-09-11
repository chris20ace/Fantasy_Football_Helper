import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import vm from 'node:vm';
import { espnLeagueIds } from '../lib/accounts/espn-discovery.ts';
import {
  createEspnPreview,
  confirmEspnPreview,
} from '../lib/accounts/espn-ticket.ts';
import { seal } from '../lib/accounts/crypto.ts';
import {
  allowedSender,
  validRequest,
  espnAccess,
  appOrigin,
} from '../extensions/espn-connector/policy.js';
process.env.CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
const entry = (league, game = 1, season = 2026, type = 9) => ({
  type: { id: type },
  metaData: {
    entry: { gameId: game, seasonId: season, groups: [{ groupId: league }] },
  },
});
void test('ESPN discovery keeps only this season NFL memberships and deduplicates leagues', () => {
  assert.deepEqual(
    espnLeagueIds(
      {
        preferences: [
          entry(123),
          entry(123, '1', '2026', '10'),
          entry(456),
          entry(987, 2),
          entry(654, 1, 2025),
          entry(321, 1, 2026, 1),
          entry('../x'),
          null,
        ],
      },
      2026,
    ),
    ['123', '456'],
  );
  assert.throws(
    () => espnLeagueIds({ preferences: [] }, 2026),
    /No ESPN NFL teams/,
  );
  assert.throws(() => espnLeagueIds(null, 2026));
  assert.throws(
    () =>
      espnLeagueIds(
        { preferences: Array.from({ length: 21 }, (_, i) => entry(i + 1)) },
        2026,
      ),
    /20 ESPN leagues/,
  );
});
const connection = {
  provider: 'espn',
  accountId: 'synthetic-owner',
  label: 'ESPN Fantasy',
  leagues: [
    { id: '123', name: 'Synthetic League', season: 2026 },
    { id: '456', name: 'Second League', season: 2026 },
  ],
  credentials: { s2: 'synthetic-session-not-real', swid: 'synthetic-owner' },
  updatedAt: '2026-09-10T00:00:00Z',
};
void test('ESPN preview tickets bind owner, expiry, revision and the verified league selection', () => {
  const ticket = createEspnPreview('user-a', connection, 'revision-a');
  assert.ok(!ticket.includes(connection.credentials.s2));
  assert.equal(
    confirmEspnPreview('user-a', ticket, ['456']).revision,
    'revision-a',
  );
  assert.deepEqual(
    confirmEspnPreview('user-a', ticket, ['456']).connection.leagues.map(
      (l) => l.id,
    ),
    ['456'],
  );
  assert.throws(() => confirmEspnPreview('user-b', ticket, ['456']));
  assert.throws(() => confirmEspnPreview('user-a', ticket, ['999']));
  assert.throws(() => confirmEspnPreview('user-a', ticket, []));
  const tampered = ticket.split('.');
  tampered[3] = (tampered[3][0] === 'A' ? 'B' : 'A') + tampered[3].slice(1);
  assert.throws(() =>
    confirmEspnPreview('user-a', tampered.join('.'), ['123']),
  );
  const expired = seal(
    { connection, revision: 'revision-a', expiresAt: Date.now() - 1 },
    'espn-preview:user-a',
  );
  assert.throws(
    () => confirmEspnPreview('user-a', expired, ['123']),
    /expired/,
  );
});
const request = {
  type: 'SUNDAY_DESK_ESPN_SESSION',
  requestId: '11111111-1111-4111-8111-111111111111',
};
const sender = { id: 'test-extension', frameId: 0, url: appOrigin + '/setup' };
async function worker({ permission = true, missing = false } = {}) {
  let listener, onInstalled, onAction;
  const reads = [],
    opened = [];
  const chrome = {
    runtime: {
      id: 'test-extension',
      onInstalled: {
        addListener: (fn) => {
          onInstalled = fn;
        },
      },
      onMessage: {
        addListener: (l) => {
          listener = l;
        },
      },
    },
    action: {
      onClicked: {
        addListener: (fn) => {
          onAction = fn;
        },
      },
    },
    tabs: {
      create: async (options) => {
        opened.push(options);
      },
    },
    permissions: { contains: async () => permission },
    cookies: {
      get: async ({ url, name }) => {
        reads.push({ url, name });
        return missing ? null : { value: 'synthetic-' + name };
      },
    },
  };
  const code = (
    await readFile(
      new URL('../extensions/espn-connector/background.js', import.meta.url),
      'utf8',
    )
  ).replace(/^import[^;]+;/, '');
  vm.runInNewContext(code, {
    chrome,
    allowedSender,
    validRequest,
    espnAccess,
    appOrigin,
  });
  return {
    reads,
    opened,
    onInstalled,
    onAction,
    listener,
    send: (msg, who) =>
      new Promise((resolve) => {
        if (!listener(msg, who, resolve)) resolve(null);
      }),
  };
}
void test('the distributed connector rejects other origins, paths, frames and extension IDs before reading cookies', async () => {
  const w = await worker();
  for (const url of [
    'http://localhost:3000/setup',
    'http://fantasy-football-helper-orcin.vercel.app/setup',
    appOrigin + '.evil.example/setup',
    appOrigin + '/setup/other',
    appOrigin + '/setupevil',
    appOrigin + '/login',
  ]) {
    assert.equal(await w.send(request, { ...sender, url }), null);
  }
  assert.equal(await w.send(request, { ...sender, frameId: 1 }), null);
  assert.equal(await w.send(request, { ...sender, id: 'other' }), null);
  assert.equal(await w.send({ ...request, requestId: 'bad' }, sender), null);
  assert.equal(w.reads.length, 0);
});
void test('the connector reads only two fixed ESPN cookie names after browser permission', async () => {
  const denied = await worker({ permission: false });
  assert.match(
    (await denied.send(request, sender)).error,
    /extension settings/,
  );
  assert.equal(denied.reads.length, 0);
  const missing = await worker({ missing: true });
  assert.match((await missing.send(request, sender)).error, /Sign in/);
  const ready = await worker();
  const result = await ready.send(request, sender);
  assert.deepEqual(ready.reads, [
    { url: 'https://fantasy.espn.com/', name: 'espn_s2' },
    { url: 'https://fantasy.espn.com/', name: 'SWID' },
  ]);
  assert.equal(result.credentials.s2, 'synthetic-espn_s2');
});
void test('the page bridge rejects foreign sources and origins and targets replies to the app origin', async () => {
  let handler;
  const sent = [],
    posted = [];
  const window = {
    addEventListener: (_, fn) => {
      handler = fn;
    },
    postMessage: (message, origin) => posted.push({ message, origin }),
  };
  window.top = window;
  const chrome = {
    runtime: {
      sendMessage: async (message) => {
        sent.push(message);
        return { error: 'Synthetic test response' };
      },
    },
  };
  const source = await readFile(
    new URL('../extensions/espn-connector/bridge.js', import.meta.url),
    'utf8',
  );
  vm.runInNewContext(source, {
    window,
    location: { origin: appOrigin, pathname: '/setup' },
    chrome,
  });
  await handler({ source: {}, origin: appOrigin, data: request });
  await handler({
    source: window,
    origin: 'https://evil.example',
    data: request,
  });
  await handler({
    source: window,
    origin: appOrigin,
    data: { ...request, requestId: 'bad' },
  });
  assert.equal(sent.length, 0);
  await handler({ source: window, origin: appOrigin, data: request });
  assert.equal(sent.length, 1);
  assert.equal(posted[0].origin, appOrigin);
  assert.equal(posted[0].message.requestId, request.requestId);
});
void test('public connector has no localhost permission or persistent credential storage', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../extensions/espn-connector/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(manifest.incognito, 'not_allowed');
  assert.deepEqual(manifest.permissions, ['cookies']);
  assert.deepEqual(manifest.host_permissions, ['https://fantasy.espn.com/*']);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.action.default_popup, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    appOrigin + '/setup*',
  ]);
  assert.ok(!JSON.stringify(manifest).includes('localhost'));
  assert.ok(!JSON.stringify(manifest).includes('storage'));
});

void test('install and toolbar open setup without collecting cookies or opening tabs on updates', async () => {
  const w = await worker();
  w.onInstalled({ reason: 'update' });
  assert.equal(w.opened.length, 0);
  w.onInstalled({ reason: 'install' });
  w.onAction();
  assert.equal(w.opened.length, 2);
  assert.ok(
    w.opened.every((tab) => tab.url === appOrigin + '/setup' && tab.active),
  );
  assert.equal(w.reads.length, 0);
});
