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
  allowedEspnSender,
  validRequest,
  validId,
  espnAccess,
  appOrigin,
  espnLoginUrl,
  flowLifetimeMs,
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
async function worker({
  permission = true,
  missing = false,
  tabClosed = false,
} = {}) {
  let listener, onInstalled, onAction, onRemoved;
  const state = {};
  const reads = [],
    opened = [],
    updated = [];
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
      onRemoved: {
        addListener: (fn) => {
          onRemoved = fn;
        },
      },
      update: async (id, options) => {
        updated.push({ id, ...options });
        if (tabClosed) throw new Error('Tab closed');
      },
      create: async (options) => {
        opened.push(options);
      },
    },
    storage: {
      session: {
        get: async (key) => ({ [key]: state[key] }),
        set: async (values) =>
          Object.assign(state, JSON.parse(JSON.stringify(values))),
        remove: async (key) => {
          delete state[key];
        },
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
    allowedEspnSender,
    validRequest,
    validId,
    espnAccess,
    appOrigin,
    espnLoginUrl,
    flowLifetimeMs,
  });
  return {
    reads,
    opened,
    updated,
    onInstalled,
    onAction,
    onRemoved,
    listener,
    state,
    setMissing: (value) => {
      missing = value;
    },
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
  await handler({
    source: window,
    origin: appOrigin,
    data: { ...request, type: 'SUNDAY_DESK_ESPN_PING' },
  });
  assert.equal(posted.at(-1).message.type, 'SUNDAY_DESK_ESPN_PONG');
  assert.equal(posted.at(-1).message.version, '0.3.0');
  assert.ok(posted.at(-1).message.capabilities.includes('same-tab-login'));
});
void test('public connector has no localhost permission or persistent credential storage', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../extensions/espn-connector/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(manifest.incognito, 'not_allowed');
  assert.equal(manifest.version, '0.3.0');
  assert.deepEqual(manifest.permissions, ['cookies', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://fantasy.espn.com/*']);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.action.default_popup, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    appOrigin + '/setup*',
  ]);
  assert.ok(!JSON.stringify(manifest).includes('localhost'));
  assert.deepEqual(manifest.content_scripts[1].matches, [
    'https://fantasy.espn.com/football*',
  ]);
  assert.deepEqual(manifest.content_scripts[1].js, ['espn-login.js']);
  const background = await readFile(
    new URL('../extensions/espn-connector/background.js', import.meta.url),
    'utf8',
  );
  assert.ok(!background.includes('storage.local'));
  assert.ok(!background.includes('storage.sync'));
});

const flowId = '22222222-2222-4222-8222-222222222222';
const otherFlowId = '33333333-3333-4333-8333-333333333333';
const appTab = { ...sender, tab: { id: 42 } };
const espnTab = { ...appTab, url: 'https://fantasy.espn.com/football/' };
const flowMessage = (name, id = flowId) => ({
  ...request,
  type: 'SUNDAY_DESK_ESPN_' + name,
  flowId: id,
});

void test('same-tab sign in requires explicit start and continue, stores only ephemeral flow metadata, and resumes once', async () => {
  const w = await worker({ missing: true });
  assert.equal((await w.send(request, appTab)).loginRequired, true);
  w.reads.length = 0;
  assert.equal(
    (await w.send(flowMessage('LOGIN_STATUS'), espnTab)).active,
    false,
  );
  assert.equal(w.updated.length, 0);
  assert.equal(w.reads.length, 0);
  assert.equal(
    (await w.send(flowMessage('BEGIN_LOGIN'), appTab)).navigating,
    true,
  );
  assert.deepEqual(w.updated, [{ id: 42, url: espnLoginUrl }]);
  assert.deepEqual(Object.keys(w.state['espn-login:42']).sort(), [
    'expiresAt',
    'flowId',
    'phase',
  ]);
  assert.equal(
    (await w.send(flowMessage('LOGIN_STATUS'), espnTab)).active,
    true,
  );
  assert.equal(w.reads.length, 0);
  const waiting = await w.send(flowMessage('COMPLETE_LOGIN'), espnTab);
  assert.equal(waiting.loginRequired, true);
  assert.equal(w.updated.length, 1);
  w.setMissing(false);
  const ready = await w.send(flowMessage('COMPLETE_LOGIN'), espnTab);
  assert.equal(ready.navigating, true);
  assert.equal(ready.credentials, undefined);
  assert.deepEqual(w.updated.at(-1), {
    id: 42,
    url: appOrigin + '/setup#espn-connect=' + flowId,
  });
  assert.ok(!JSON.stringify(w.state).includes('synthetic'));
  assert.equal(
    (await w.send(flowMessage('LOGIN_STATUS'), espnTab)).active,
    false,
  );
  const results = await Promise.all([
    w.send(flowMessage('RESUME_LOGIN'), appTab),
    w.send(flowMessage('RESUME_LOGIN'), appTab),
  ]);
  assert.equal(results.filter((result) => result.credentials).length, 1);
  assert.equal(results.filter((result) => result.error).length, 1);
  assert.deepEqual(w.state, {});
  assert.equal(w.opened.length, 0);
});

void test('flow actions reject cross-origin requests, wrong frames, other tabs, changed nonces, and premature resume without reading cookies', async () => {
  const w = await worker();
  await w.send(flowMessage('BEGIN_LOGIN'), appTab);
  for (const url of [
    appOrigin + '.evil.example/setup',
    'https://espn.com/football/',
    'https://fantasy.espn.com.evil.example/football/',
    'https://fantasy.espn.com/footballevil',
    'http://fantasy.espn.com/football/',
    'https://fantasy.espn.com/basketball/',
  ])
    assert.equal(
      await w.send(flowMessage('COMPLETE_LOGIN'), { ...espnTab, url }),
      null,
    );
  assert.equal(
    await w.send(flowMessage('COMPLETE_LOGIN'), { ...espnTab, frameId: 1 }),
    null,
  );
  assert.equal(
    await w.send(flowMessage('COMPLETE_LOGIN'), {
      ...espnTab,
      id: 'another-extension',
    }),
    null,
  );
  assert.equal(await w.send(flowMessage('SESSION'), espnTab), null);
  assert.equal(await w.send(flowMessage('COMPLETE_LOGIN'), appTab), null);
  assert.equal(await w.send(flowMessage('BEGIN_LOGIN'), espnTab), null);
  assert.equal(
    await w.send(
      flowMessage('BEGIN_LOGIN', '------------------------------------'),
      appTab,
    ),
    null,
  );
  assert.match(
    (await w.send(flowMessage('RESUME_LOGIN'), appTab)).error,
    /expired/,
  );
  assert.match(
    (
      await w.send(flowMessage('COMPLETE_LOGIN'), {
        ...espnTab,
        tab: { id: 99 },
      })
    ).error,
    /expired/,
  );
  assert.match(
    (await w.send(flowMessage('COMPLETE_LOGIN', otherFlowId), espnTab)).error,
    /expired/,
  );
  assert.equal(w.reads.length, 0);
  assert.equal(w.updated.length, 1);
});

void test('expired, cancelled, closed, and failed-navigation flows never survive or open another tab', async () => {
  const w = await worker();
  await w.send(flowMessage('BEGIN_LOGIN'), appTab);
  w.state['espn-login:42'].expiresAt = Date.now() - 1;
  assert.equal(
    (await w.send(flowMessage('LOGIN_STATUS'), espnTab)).active,
    false,
  );
  assert.deepEqual(w.state, {});
  assert.equal(
    (await w.send(flowMessage('CANCEL_LOGIN'), espnTab)).navigating,
    true,
  );
  assert.deepEqual(w.updated.at(-1), { id: 42, url: appOrigin + '/setup' });
  await w.send(flowMessage('BEGIN_LOGIN'), appTab);
  assert.equal(
    (await w.send(flowMessage('CANCEL_LOGIN'), espnTab)).navigating,
    true,
  );
  assert.deepEqual(w.state, {});
  assert.deepEqual(w.updated.at(-1), { id: 42, url: appOrigin + '/setup' });
  await w.send(flowMessage('BEGIN_LOGIN'), appTab);
  w.onRemoved(42);
  assert.deepEqual(w.state, {});
  const closed = await worker({ tabClosed: true });
  await closed.send(flowMessage('BEGIN_LOGIN'), appTab);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(closed.state, {});
  assert.equal(w.opened.length + closed.opened.length, 0);
  assert.equal(w.reads.length + closed.reads.length, 0);
});

void test('ESPN helper is absent on ordinary visits and accepts only trusted button clicks during an active flow', async () => {
  const source = await readFile(
    new URL('../extensions/espn-connector/espn-login.js', import.meta.url),
    'utf8',
  );
  async function page(active) {
    const nodes = [],
      sent = [],
      appended = [];
    const window = {};
    window.top = window;
    const document = {
      createElement: (tag) => {
        const node = {
          tag,
          dataset: {},
          children: [],
          handlers: {},
          append(...children) {
            this.children.push(...children);
          },
          setAttribute() {},
          attachShadow() {
            return document.createElement('shadow');
          },
          addEventListener(name, fn) {
            this.handlers[name] = fn;
          },
        };
        nodes.push(node);
        return node;
      },
      documentElement: { append: (node) => appended.push(node) },
    };
    vm.runInNewContext(source, {
      window,
      document,
      crypto: { randomUUID: () => request.requestId },
      location: { origin: 'https://fantasy.espn.com', pathname: '/football/' },
      chrome: {
        runtime: {
          sendMessage: async (message) => {
            sent.push(message);
            return message.type.endsWith('LOGIN_STATUS')
              ? { active, flowId, expiresAt: Date.now() + 60_000 }
              : { error: 'Still signed out' };
          },
        },
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    return { nodes, sent, appended };
  }
  const ordinary = await page(false);
  assert.equal(ordinary.appended.length, 0);
  assert.deepEqual(
    ordinary.sent.map((message) => message.type),
    ['SUNDAY_DESK_ESPN_LOGIN_STATUS'],
  );
  const active = await page(true);
  assert.equal(active.appended.length, 1);
  const proceed = active.nodes.find(
    (node) => node.tag === 'button' && node.className === 'primary',
  );
  proceed.handlers.click({ isTrusted: false });
  assert.equal(active.sent.length, 1);
  proceed.handlers.click({ isTrusted: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active.sent.at(-1).type, 'SUNDAY_DESK_ESPN_COMPLETE_LOGIN');
  assert.equal(active.sent.at(-1).flowId, flowId);
  assert.equal(proceed.disabled, false);
});

void test('toolbar reuses the clicked tab; installation never opens a page or collects cookies', async () => {
  const w = await worker();
  assert.equal(w.onInstalled, undefined);
  w.onAction({ id: 42 });
  assert.deepEqual(w.updated, [{ id: 42, url: appOrigin + '/setup' }]);
  assert.equal(w.opened.length, 0);
  assert.equal(w.reads.length, 0);
});
void test('missing or closed toolbar tabs do not trigger a replacement tab', async () => {
  const w = await worker({ tabClosed: true });
  w.onAction();
  w.onAction({ id: -1 });
  assert.equal(w.updated.length, 0);
  w.onAction({ id: 7 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(w.updated.length, 1);
  assert.equal(w.opened.length, 0);
  assert.equal(w.reads.length, 0);
});
