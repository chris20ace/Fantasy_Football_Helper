import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginEspnFlow,
  consumeEspnReturn,
  connectorInfo,
} from '../lib/accounts/espn-browser-flow.ts';
import {
  createNativeEspnClient,
  requestEspnExtension,
  validEspnSession,
} from '../lib/accounts/espn-session-client.ts';
import { releasedConnectorVersion } from '../lib/accounts/connector-availability.ts';
import { connectorStoreId } from '../lib/accounts/connector-release.ts';
const credentials = {
  s2: 'synthetic-session-only',
  swid: '{11111111-2222-3333-4444-555555555555}',
};
const origin = 'https://fantasy-football-helper-orcin.vercel.app';
function windowFixture() {
  const target = new EventTarget(),
    messages = [];
  Object.assign(target, {
    location: { origin, pathname: '/setup' },
    setTimeout,
    clearTimeout,
    postMessage: (value) => messages.push(value),
  });
  return {
    target,
    messages,
    reply(value, extra = {}) {
      target.dispatchEvent(
        Object.assign(new Event('message'), {
          source: target,
          origin,
          data: value,
          ...extra,
        }),
      );
    },
  };
}
function nativeFixture() {
  const f = windowFixture();
  f.target.SundayDeskEspn = {
    postMessage: (value) => f.messages.push(JSON.parse(value)),
  };
  f.nativeReply = (request, value) =>
    f.target.SundayDeskEspn.onmessage({
      data: JSON.stringify({ ...request, ...value }),
    });
  f.client = createNativeEspnClient(f.target);
  return f;
}
function memoryStore() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    map,
  };
}
test('browser return is single-use, account-bound, and expires without storing credentials', () => {
  const store = memoryStore();
  const first = beginEspnFlow(store, 'account-a', 1000);
  assert.deepEqual(Object.keys(JSON.parse([...store.map.values()][0])).sort(), [
    'accountId',
    'expiresAt',
    'flowId',
  ]);
  assert.equal(
    consumeEspnReturn(store, '#espn-connect=' + first, 'account-b', 1001),
    null,
  );
  assert.equal(
    consumeEspnReturn(store, '#espn-connect=' + first, 'account-a', 1002),
    null,
  );
  const second = beginEspnFlow(store, 'account-a', 1000);
  assert.equal(
    consumeEspnReturn(store, '#espn-connect=' + second, 'account-a', 601000),
    null,
  );
  const third = beginEspnFlow(store, 'account-a', 1000);
  assert.equal(
    consumeEspnReturn(store, '#espn-connect=' + third, 'account-a', 1001),
    third,
  );
  assert.equal(
    consumeEspnReturn(store, '#espn-connect=' + third, 'account-a', 1002),
    null,
  );
});
test('old connector replies cannot enable guided login, and release version comes from verified Google package', () => {
  assert.deepEqual(connectorInfo({}), { version: null, guidedLogin: false });
  assert.equal(connectorInfo({ version: '0.3.0' }).guidedLogin, false);
  assert.equal(
    connectorInfo({ version: '0.3.0', capabilities: ['same-tab-login'] })
      .guidedLogin,
    true,
  );
  const manifest = `<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0"><app appid="${connectorStoreId}" status="ok"><updatecheck status="ok" version="0.3.7" codebase="https://clients2.googleusercontent.com/release.crx" /></app></gupdate>`;
  assert.equal(releasedConnectorVersion(manifest), '0.3.7');
  assert.equal(
    releasedConnectorVersion(manifest.replace(connectorStoreId, 'other')),
    null,
  );
});
test('desktop replies reject foreign origin, stale IDs and leaving setup; cancel discards late credentials', async () => {
  const f = windowFixture();
  const request = requestEspnExtension(f.target, 'SUNDAY_DESK_ESPN_SESSION');
  const id = f.messages[0].requestId;
  const result = {
    type: 'SUNDAY_DESK_ESPN_RESULT',
    requestId: id,
    credentials,
  };
  f.reply(result, { origin: 'https://evil.example' });
  f.reply({ ...result, requestId: 'old' });
  f.target.location.pathname = '/account';
  f.reply(result);
  await assert.rejects(request, { code: 'UNTRUSTED_ORIGIN' });
  f.target.location.pathname = '/setup';
  const abort = new AbortController();
  const cancelled = requestEspnExtension(
    f.target,
    'SUNDAY_DESK_ESPN_SESSION',
    undefined,
    abort.signal,
  );
  abort.abort();
  f.reply({ ...result, requestId: f.messages.at(-1).requestId });
  await assert.rejects(cancelled, { code: 'CANCELLED' });
});
test('guided login requires explicit matching navigation acknowledgement', async () => {
  const f = windowFixture(),
    flowId = crypto.randomUUID();
  const request = requestEspnExtension(
    f.target,
    'SUNDAY_DESK_ESPN_BEGIN_LOGIN',
    flowId,
  );
  f.reply({
    type: 'SUNDAY_DESK_ESPN_RESULT',
    requestId: f.messages[0].requestId,
    navigating: true,
    flowId,
  });
  assert.equal((await request).navigating, true);
});
test('native handshake and explicit connect accept only the matching native reply', async () => {
  const f = nativeFixture();
  const ready = f.client.available();
  const status = f.messages.at(-1);
  f.nativeReply(
    { ...status, requestId: 'stale' },
    { success: true, available: true, version: 1 },
  );
  f.nativeReply(status, { success: true, available: true, version: 1 });
  assert.equal(await ready, true);
  assert.equal(f.messages.length, 1);
  const connect = f.client.connect();
  await assert.rejects(f.client.connect(), { code: 'BUSY' });
  f.nativeReply(f.messages.at(-1), { success: true, ...credentials });
  assert.deepEqual(await connect, credentials);
  f.client.dispose();
});
test('native cancellation sends no secrets and late success cannot complete a cancelled request', async () => {
  const f = nativeFixture(),
    controller = new AbortController();
  const connect = f.client.connect(controller.signal),
    request = f.messages.at(-1);
  controller.abort();
  const cancel = f.messages.at(-1);
  assert.deepEqual(cancel, { command: 'cancel', requestId: request.requestId });
  f.nativeReply(request, { success: true, ...credentials });
  f.nativeReply(cancel, { success: true });
  await assert.rejects(connect, { code: 'CANCELLED' });
  assert.ok(!JSON.stringify(f.messages).includes(credentials.s2));
  f.client.dispose();
});
test('native rejects a changed origin, malformed sessions and raw provider errors', async () => {
  const f = nativeFixture();
  const moved = f.client.connect();
  f.target.location.pathname = '/account';
  f.nativeReply(f.messages.at(-1), { success: true, ...credentials });
  await assert.rejects(moved, { code: 'UNTRUSTED_ORIGIN' });
  f.target.location.pathname = '/setup';
  const invalid = f.client.connect();
  f.nativeReply(f.messages.at(-1), {
    success: true,
    s2: '',
    swid: credentials.swid,
  });
  await assert.rejects(invalid, { code: 'SESSION_MISSING' });
  const error = f.client.connect();
  f.nativeReply(f.messages.at(-1), {
    success: false,
    error: { code: 'UNKNOWN', message: credentials.s2 },
  });
  await assert.rejects(error, (e) => !e.message.includes(credentials.s2));
  f.client.dispose();
});
test('iOS reply promise follows the same protocol and disposal cancels pending login', async () => {
  const f = windowFixture();
  let complete;
  f.target.webkit = {
    messageHandlers: {
      SundayDeskEspn: {
        postMessage: async (request) => {
          f.messages.push(request);
          if (request.command === 'status')
            return { ...request, success: true, available: true, version: 1 };
          if (request.command === 'cancel')
            return { ...request, success: true };
          return new Promise((resolve) => {
            complete = resolve;
          });
        },
      },
    },
  };
  const client = createNativeEspnClient(f.target);
  assert.equal(await client.available(), true);
  const request = client.connect();
  const command = f.messages.at(-1);
  client.dispose();
  complete({ ...command, success: true, ...credentials });
  await assert.rejects(request, { code: 'CANCELLED' });
  assert.equal(f.messages.at(-1).command, 'cancel');
  assert.equal(validEspnSession({ ...credentials, s2: 'a\r\nb' }), false);
  assert.equal(createNativeEspnClient(windowFixture().target), null);
});
