import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InsightQueue } from '../lib/fantasy/insight-queue.ts';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const target = (id, week = 1, season = 2026) => ({
  id: `sleeper:${id}`,
  week,
  season,
});
const report = (t) => ({
  projectionSource: 'provider',
  league: { id: t.id, week: t.week, season: t.season, players: [], slots: [] },
  candidates: [],
});
function harness() {
  const calls = [];
  let entries = {},
    unauthorized = 0;
  const queue = new InsightQueue({
    fetch: (url, init) =>
      new Promise((resolve) =>
        calls.push({ url, signal: init.signal, resolve }),
      ),
    onChange: (value) => (entries = value),
    onUnauthorized: () => unauthorized++,
  });
  return {
    queue,
    calls,
    get entries() {
      return entries;
    },
    get unauthorized() {
      return unauthorized;
    },
    answer(index, t, status = 200) {
      calls[index].resolve(
        Response.json(status === 200 ? report(t) : { error: 'Unavailable' }, {
          status,
        }),
      );
    },
  };
}
void test('all-league queue bounds concurrency, publishes partial results and prioritizes the selected pending league', async () => {
  const h = harness(),
    targets = Array.from({ length: 7 }, (_, i) => target(i + 1));
  try {
    h.queue.replace(targets);
    assert.equal(h.calls.length, 3);
    assert.equal(Object.keys(h.entries).length, 7);
    assert.equal(h.entries['sleeper:7'].phase, 'queued');
    h.queue.prioritize('sleeper:7');
    assert.equal(h.calls.length, 3);
    h.answer(0, targets[0]);
    await tick();
    assert.equal(h.calls.length, 4);
    assert.match(h.calls[3].url, /sleeper%3A7/);
    assert.equal(h.entries['sleeper:1'].phase, 'ready');
    assert.equal(h.entries['sleeper:2'].phase, 'loading');
  } finally {
    h.queue.dispose();
  }
});
void test('one failure leaves successful leagues available and retry touches only that league', async () => {
  const h = harness(),
    targets = [target(1), target(2)];
  try {
    h.queue.replace(targets);
    h.answer(0, targets[0]);
    h.answer(1, targets[1], 503);
    await tick();
    assert.equal(h.entries['sleeper:1'].phase, 'ready');
    assert.equal(h.entries['sleeper:2'].phase, 'error');
    const ready = h.entries['sleeper:1'].report;
    h.queue.retry('sleeper:2');
    h.queue.retry('sleeper:2');
    assert.equal(h.calls.length, 3);
    assert.match(h.calls[2].url, /refresh=1/);
    assert.equal(h.entries['sleeper:1'].report, ready);
    h.answer(2, targets[1]);
    await tick();
    assert.equal(h.entries['sleeper:2'].phase, 'ready');
    h.queue.prioritize('sleeper:1');
    assert.equal(h.calls.length, 3);
  } finally {
    h.queue.dispose();
  }
});
void test('late responses and old 401s cannot survive removal or a week/account generation change', async () => {
  const h = harness();
  try {
    h.queue.replace([target(1), target(2)]);
    h.queue.replace([target(1, 2)]);
    assert.ok(h.calls[0].signal.aborted);
    assert.deepEqual(Object.keys(h.entries), ['sleeper:1']);
    h.answer(2, target(1, 2));
    await tick();
    h.answer(0, target(1), 401);
    h.answer(1, target(2));
    await tick();
    assert.equal(h.unauthorized, 0);
    assert.equal(h.entries['sleeper:1'].report.league.week, 2);
    assert.ok(!h.entries['sleeper:2']);
  } finally {
    h.queue.dispose();
  }
});
void test('source, league, season and week must all match before a report becomes usable', async () => {
  for (const mutate of [
    (r) => (r.projectionSource = 'model'),
    (r) => (r.league.id = 'espn:9'),
    (r) => (r.league.week = 2),
    (r) => (r.league.season = 2025),
  ]) {
    const h = harness();
    try {
      h.queue.replace([target(1)]);
      const r = report(target(1));
      mutate(r);
      h.calls[0].resolve(Response.json(r));
      await tick();
      assert.equal(h.entries['sleeper:1'].phase, 'error');
      assert.equal(h.entries['sleeper:1'].report, null);
    } finally {
      h.queue.dispose();
    }
  }
});
void test('an active unauthorized response cancels the whole scoped scan once', async () => {
  const h = harness();
  h.queue.replace([target(1), target(2), target(3), target(4)]);
  h.answer(0, target(1), 401);
  await tick();
  assert.equal(h.unauthorized, 1);
  assert.equal(h.calls.length, 3);
  assert.ok(h.calls[1].signal.aborted);
  h.answer(1, target(2), 401);
  await tick();
  assert.equal(h.unauthorized, 1);
  h.queue.dispose();
});
void test(
  'timeouts release capacity for remaining leagues instead of leaving the queue stuck',
  { timeout: 2000 },
  async () => {
    let entries = {},
      calls = 0;
    let finish;
    const completed = new Promise((resolve) => {
      finish = resolve;
    });
    const queue = new InsightQueue({
      concurrency: 1,
      timeoutMs: 15,
      onChange: (e) => {
        entries = e;
        if (
          e['sleeper:1']?.phase === 'error' &&
          e['sleeper:2']?.phase === 'error'
        )
          finish();
      },
      onUnauthorized: () => assert.fail(),
      fetch: (_url, { signal }) => {
        calls++;
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          }),
        );
      },
    });
    try {
      queue.replace([target(1), target(2)]);
      await completed;
      assert.equal(calls, 2);
      assert.equal(entries['sleeper:1'].phase, 'error');
      assert.equal(entries['sleeper:2'].phase, 'error');
    } finally {
      queue.dispose();
    }
  },
);
