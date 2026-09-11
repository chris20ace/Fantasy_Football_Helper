import test from 'node:test';
import assert from 'node:assert/strict';
import { watchConnector } from '../lib/accounts/connector-detection.ts';
import {
  isPublicConnector,
  getConnectorRelease,
} from '../lib/accounts/connector-availability.ts';
import {
  connectorStoreId as id,
  connectorStoreUrl,
} from '../lib/accounts/connector-release.ts';

const xml = (app) =>
  `<?xml version="1.0"?><gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">${app}</gupdate>`;
const published = xml(
  `<app appid="${id}" status="ok"><updatecheck status="ok" version="0.2.0" codebase="https://clients2.googleusercontent.com/crx/blobs/release.crx" /></app>`,
);
const pending = xml(`<app appid="${id}" status="error-unknownApplication"/>`);
const listing = `<link rel="canonical" href="https://chromewebstore.google.com/detail/sunday-desk-espn-connector/${id}"><button disabled><span>Add to Chrome</span></button>`;

void test('store availability requires the exact public listing and a released package', () => {
  assert.equal(isPublicConnector(published, listing), true);
  assert.equal(
    isPublicConnector(pending, '<title>Chrome Web Store</title>'),
    false,
  );
  assert.equal(isPublicConnector(pending, listing), false);
  assert.equal(
    isPublicConnector(published, '<title>Chrome Web Store</title>'),
    false,
  );
  assert.equal(
    isPublicConnector(published, listing.replace(id, 'a'.repeat(32))),
    false,
  );
  assert.equal(
    isPublicConnector(published.replace(id, 'a'.repeat(32)), listing),
    false,
  );
  assert.equal(
    isPublicConnector(
      published,
      listing.replace('chromewebstore.google.com', 'evil.example'),
    ),
    false,
  );
  assert.equal(
    isPublicConnector(
      published,
      listing.replace('Add to Chrome', 'Unavailable'),
    ),
    false,
  );
  assert.equal(
    isPublicConnector(
      published.replace('clients2.googleusercontent.com', 'evil.example'),
      listing,
    ),
    false,
  );
  assert.equal(
    isPublicConnector(published.replace('</gupdate>', ''), listing),
    false,
  );
});

void test('store checks share a cache, follow only the matching store listing, and fail closed', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  let available = false,
    failed = false,
    redirect = `https://chromewebstore.google.com/detail/sunday-desk-espn-connector/${id}?hl=en`;
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    urls.push(url);
    assert.equal(options.credentials, 'omit');
    assert.equal(
      options.redirect,
      String(url).startsWith('https://clients2.google.com/')
        ? 'error'
        : 'manual',
    );
    if (failed) throw new Error('Temporary store outage');
    if (url === connectorStoreUrl + '?hl=en')
      return new Response(null, {
        status: 301,
        headers: { location: redirect },
      });
    return new Response(
      String(url).startsWith('https://clients2.google.com/')
        ? available
          ? published
          : pending
        : listing,
    );
  });
  const first = await Promise.all([
    getConnectorRelease(),
    getConnectorRelease(),
  ]);
  assert.ok(
    first.every((r) => r.status === 'in-review' && r.storeUrl === null),
  );
  assert.equal(urls.length, 1);
  await getConnectorRelease();
  assert.equal(urls.length, 1);
  available = true;
  t.mock.timers.setTime(1300001);
  assert.deepEqual(await getConnectorRelease(), {
    version: '0.2.0',
    status: 'published',
    storeUrl: connectorStoreUrl,
  });
  assert.equal(urls.length, 4);
  redirect = `https://evil.example/detail/${id}`;
  t.mock.timers.setTime(1600002);
  assert.equal((await getConnectorRelease()).storeUrl, null);
  assert.ok(
    !urls.some((url) => String(url).startsWith('https://evil.example')),
  );
  redirect =
    'https://chromewebstore.google.com/detail/another/' + 'a'.repeat(32);
  t.mock.timers.setTime(1900003);
  assert.equal((await getConnectorRelease()).storeUrl, null);
  assert.ok(!urls.includes(redirect));
  failed = true;
  t.mock.timers.setTime(2200004);
  assert.equal((await getConnectorRelease()).storeUrl, null);
});

function browser() {
  const target = new EventTarget(),
    document = new EventTarget(),
    messages = [];
  document.visibilityState = 'visible';
  Object.assign(target, {
    document,
    location: { origin: 'https://fantasy-football-helper-orcin.vercel.app' },
    setInterval: (callback, delay) => setInterval(() => callback(), delay),
    clearInterval: (...args) => clearInterval(...args),
    setTimeout: (callback, delay) => setTimeout(() => callback(), delay),
    clearTimeout: (...args) => clearTimeout(...args),
    postMessage: (data, origin) => messages.push({ data, origin }),
  });
  const pong = (overrides = {}) =>
    target.dispatchEvent(
      Object.assign(new Event('message'), {
        source: target,
        origin: target.location.origin,
        data: {
          type: 'SUNDAY_DESK_ESPN_PONG',
          requestId: messages.at(-1).data.requestId,
        },
        ...overrides,
      }),
    );
  return { target, messages, pong };
}

void test('a bridge arriving after document idle is detected, with no cookie request', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const b = browser();
  let ready = false,
    checking = false;
  const watcher = watchConnector(
    b.target,
    () => {
      ready = true;
    },
    (v) => {
      checking = v;
    },
  );
  t.mock.timers.tick(2250);
  assert.ok(b.messages.length > 2);
  assert.equal(checking, true);
  b.pong();
  assert.equal(ready, true);
  assert.equal(checking, false);
  assert.ok(
    b.messages.every(
      (m) =>
        m.data.type === 'SUNDAY_DESK_ESPN_PING' &&
        m.origin === b.target.location.origin,
    ),
  );
  const count = b.messages.length;
  watcher.dispose();
  t.mock.timers.tick(10000);
  b.target.dispatchEvent(new Event('focus'));
  assert.equal(b.messages.length, count);
});

void test('a timed-out probe can recover on return or retry and rejects stale/foreign replies', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const b = browser();
  let ready = 0,
    checking = false;
  const watcher = watchConnector(
    b.target,
    () => {
      ready++;
    },
    (v) => {
      checking = v;
    },
  );
  const oldId = b.messages[0].data.requestId;
  t.mock.timers.tick(8000);
  assert.equal(checking, false);
  const count = b.messages.length;
  t.mock.timers.tick(10000);
  assert.equal(b.messages.length, count);
  b.target.dispatchEvent(new Event('focus'));
  assert.equal(checking, true);
  assert.notEqual(b.messages.at(-1).data.requestId, oldId);
  b.pong({ origin: 'https://evil.example' });
  b.pong({ source: {} });
  b.pong({ data: { type: 'SUNDAY_DESK_ESPN_PONG', requestId: oldId } });
  assert.equal(ready, 0);
  watcher.probe();
  b.pong();
  assert.equal(ready, 1);
  watcher.dispose();
});
