import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../lib/accounts/db.ts';
import {
  loadWorkspace,
  changeConnection,
  selectConnectionLeagues,
  publicConnections,
  saveCache,
  readCache,
  getPreferences,
  putPreferences,
} from '../lib/accounts/storage.ts';
const base = process.env.TEST_APP_URL ?? 'http://localhost:3000',
  emails = [],
  users = [];
const request = (path, body, cookie, origin = base) =>
  fetch(base + path, {
    method: body ? 'POST' : 'GET',
    redirect: 'manual',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const league = (id) => ({ id, name: 'Synthetic ' + id, season: 2026 });
const fixture = (provider, ids) => ({
  provider,
  accountId: 'synthetic-account',
  label: 'Synthetic',
  leagues: ids.map(league),
  updatedAt: new Date().toISOString(),
  ...(provider === 'espn'
    ? {
        credentials: {
          s2: 'synthetic-session-not-valid',
          swid: 'synthetic-owner',
        },
      }
    : {}),
});
try {
  assert.equal(
    (
      await request('/api/connections', {
        action: 'select-leagues',
        provider: 'espn',
        leagueIds: [],
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/api/connections/sleeper', {
        action: 'discover',
        username: 'bam6i',
      })
    ).status,
    401,
  );
  for (let i = 0; i < 2; i++) {
    const email = `league-selection-${randomUUID()}@example.test`,
      password = randomUUID() + '-test';
    emails.push(email);
    let r = await request('/api/auth/sign-up/email', {
      email,
      password,
      name: 'League selection validation',
    });
    assert.equal(r.status, 200);
    r = await request('/api/auth/sign-in/email', { email, password });
    assert.equal(r.status, 200);
    const data = await r.json(),
      cookie = r.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; ');
    users.push({ id: data.user.id, cookie });
  }
  const [a, b] = users;
  await changeConnection(
    a.id,
    'sleeper',
    fixture('sleeper', ['101', '102']),
    'empty',
  );
  await changeConnection(
    a.id,
    'espn',
    fixture('espn', ['201', '202']),
    (await loadWorkspace(a.id)).revision,
  );
  await changeConnection(b.id, 'espn', fixture('espn', ['901']), 'empty');
  await putPreferences(
    a.id,
    { notes: { 'espn:201': 'Keep my research' }, reviewed: {} },
    0,
  );
  await saveCache('selection-test:' + a.id, { private: true }, a.id);
  await saveCache('selection-test:' + b.id, { private: true }, b.id);
  const before = await loadWorkspace(a.id),
    stored = before.connections.find((c) => c.provider === 'espn');
  const save = (provider, leagueIds, revision) =>
    request(
      '/api/connections',
      {
        action: 'select-leagues',
        provider,
        leagueIds,
        revision: revision ?? current[0].revision,
      },
      a.cookie,
    );
  let current = await publicConnections(a.id);
  let r = await save('espn', ['202']);
  assert.equal(r.status, 200);
  current = (await r.json()).connections;
  assert.deepEqual(
    current.find((c) => c.provider === 'espn').leagues.map((l) => l.id),
    ['202'],
  );
  assert.equal(
    current.find((c) => c.provider === 'espn').availableLeagues.length,
    2,
  );
  assert.equal(current.find((c) => c.provider === 'sleeper').leagues.length, 2);
  assert.equal(await readCache('selection-test:' + a.id, a.id), null);
  assert.ok(await readCache('selection-test:' + b.id, b.id));
  assert.equal(
    (await request('/api/insights?league=espn:201&week=1', null, a.cookie))
      .status,
    503,
    'Removed league is unauthorized before any provider access',
  );
  r = await save('espn', ['201', '202']);
  assert.equal(r.status, 200);
  current = (await r.json()).connections;
  assert.equal(
    (await getPreferences(a.id)).notes['espn:201'],
    'Keep my research',
  );
  assert.deepEqual(
    (await loadWorkspace(a.id)).connections.find((c) => c.provider === 'espn')
      .credentials,
    stored.credentials,
  );
  const stable = (await loadWorkspace(a.id)).revision;
  assert.equal((await save('espn', ['201', '901'])).status, 400);
  assert.equal((await save('sleeper', ['201'])).status, 400);
  assert.equal((await save('espn', ['202'], before.revision)).status, 400);
  assert.equal(
    (
      await request(
        '/api/connections',
        {
          action: 'select-leagues',
          provider: 'espn',
          leagueIds: ['201'],
          revision: (await loadWorkspace(b.id)).revision,
        },
        b.cookie,
      )
    ).status,
    400,
  );
  const crossOrigin = await request(
    '/api/connections',
    {
      action: 'select-leagues',
      provider: 'espn',
      leagueIds: [],
      revision: stable,
    },
    a.cookie,
    'https://example.invalid',
  );
  assert.ok(
    [400, 403].includes(crossOrigin.status),
    'Foreign origins must be rejected by the runtime or route',
  );
  assert.equal((await loadWorkspace(a.id)).revision, stable);
  r = await save('espn', []);
  assert.equal(r.status, 200);
  current = (await r.json()).connections;
  r = await save('sleeper', []);
  assert.equal(r.status, 200);
  current = (await r.json()).connections;
  assert.ok(current.every((c) => c.leagues.length === 0));
  assert.equal(current.length, 2);
  const empty = await (await request('/api/dashboard', null, a.cookie)).json();
  assert.deepEqual(empty.leagues, []);
  const home = await request('/', null, a.cookie);
  assert.ok([302, 303, 307, 308].includes(home.status));
  assert.ok(home.headers.get('location')?.endsWith('/setup'));
  assert.equal((await request('/setup', null, a.cookie)).status, 200);
  const publicBody = JSON.stringify(
    await (await request('/api/connections', null, a.cookie)).json(),
  );
  assert.ok(!publicBody.includes('synthetic-session'));
  assert.ok(!publicBody.includes('accountId'));
  assert.ok(!publicBody.includes('credentials'));
  const latest = await loadWorkspace(a.id);
  const writes = await Promise.allSettled([
    selectConnectionLeagues(a.id, 'espn', ['201'], latest.revision),
    selectConnectionLeagues(a.id, 'espn', ['202'], latest.revision),
  ]);
  assert.equal(writes.filter((v) => v.status === 'fulfilled').length, 1);
  assert.equal(writes.filter((v) => v.status === 'rejected').length, 1);
  assert.deepEqual(
    (await publicConnections(b.id))[0].leagues.map((l) => l.id),
    ['901'],
  );
  // Public Sleeper discovery is a preview: it does not replace the saved connection until confirmation.
  const untouched = (await loadWorkspace(b.id)).revision;
  r = await request(
    '/api/connections/sleeper',
    { action: 'discover', username: 'bam6i' },
    b.cookie,
  );
  assert.equal(r.status, 200);
  const preview = await r.json();
  assert.ok(preview.leagues.length >= 2);
  assert.equal((await loadWorkspace(b.id)).revision, untouched);
  r = await request(
    '/api/connections/sleeper',
    {
      action: 'confirm',
      ticket: preview.ticket,
      leagueIds: [preview.leagues[0].id],
    },
    b.cookie,
  );
  assert.equal(r.status, 200);
  const connected = (await r.json()).connections.find(
    (c) => c.provider === 'sleeper',
  );
  assert.equal(connected.leagues.length, 1);
  assert.equal(connected.availableLeagues.length, preview.leagues.length);
  r = await request(
    '/api/connections/sleeper',
    { action: 'discover', username: 'bam6i' },
    b.cookie,
  );
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).selectedLeagueIds, [preview.leagues[0].id]);
  console.log(
    'PASS: remove/re-add, empty selection, retained credentials/notes, stale and foreign-ID rejection, tenant isolation, cache invalidation, concurrent saves and Sleeper choose-before-connect/reconnect.',
  );
} finally {
  for (const email of emails)
    await getPool().query('delete from sunday_desk."user" where email=$1', [
      email,
    ]);
  await getPool().end();
}
