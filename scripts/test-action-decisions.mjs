import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../lib/accounts/db.ts';

// Run against a configured app using the same database. Only synthetic users
// created by this run are touched, and their data is removed in finally.
const base = process.env.TEST_APP_URL ?? 'http://localhost:3000';
const users = [];
const request = (path, method = 'GET', body, cookie, origin = base) =>
  fetch(base + path, {
    method,
    redirect: 'manual',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const key = '2026:1:sleeper:synthetic:lineup';
const fingerprint = 'abcdef0123456789';
const decision = (revision, status = 'acknowledged', extra = {}) => ({
  key,
  fingerprint,
  revision,
  status,
  ...extra,
});

try {
  for (let i = 0; i < 2; i++) {
    const email = `action-decisions-${randomUUID()}@example.test`;
    const password = randomUUID() + '-test-password';
    const user = { email };
    users.push(user);
    let response = await request('/api/auth/sign-up/email', 'POST', {
      email,
      password,
      name: 'Action queue validation',
    });
    assert.equal(response.status, 200, 'Create synthetic account');
    user.id = (await response.json()).user.id;
    response = await request('/api/auth/sign-in/email', 'POST', {
      email,
      password,
    });
    assert.equal(response.status, 200, 'Sign in synthetic account');
    user.cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ');
  }
  const read = async (user = users[0]) => {
    const response = await request(
      '/api/preferences',
      'GET',
      undefined,
      user.cookie,
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    return response.json();
  };
  const save = (method, body, user = users[0], origin = base) =>
    request('/api/preferences', method, body, user.cookie, origin);

  assert.equal((await request('/api/preferences')).status, 401);
  assert.equal(
    (await request('/api/preferences', 'PATCH', decision(0))).status,
    401,
  );
  assert.deepEqual((await read()).actionDecisions, {});
  assert.equal((await read()).revision, 0);
  const notes = { synthetic: 'Keep my private draft' };
  const reviewed = { synthetic: true };
  assert.equal(
    (await save('PUT', { notes, reviewed, revision: 0 })).status,
    200,
  );
  const start = Date.now();
  let response = await save('PATCH', decision(1, 'dismissed'));
  assert.equal(response.status, 200);
  let state = await read();
  assert.equal(state.revision, 2);
  assert.deepEqual(state.notes, notes);
  assert.deepEqual(state.reviewed, reviewed);
  assert.equal(state.actionDecisions[key].status, 'dismissed');
  assert.equal(state.actionDecisions[key].fingerprint, fingerprint);
  assert.ok(state.actionDecisions[key].updatedAt >= start);
  assert.deepEqual((await read(users[1])).actionDecisions, {});

  // Body-supplied owner IDs cannot write to another account.
  response = await save(
    'PATCH',
    decision(2, 'acknowledged', { userId: users[1].id }),
  );
  assert.equal(response.status, 200);
  assert.equal((await read()).actionDecisions[key].status, 'acknowledged');
  assert.deepEqual((await read(users[1])).actionDecisions, {});

  for (const update of [
    decision(3, 'invalid'),
    decision(-1),
    decision(3, 'dismissed', { key: '__proto__' }),
    decision(3, 'dismissed', { fingerprint: 'bad' }),
    decision(3, 'dismissed', { padding: 'x'.repeat(4096) }),
  ])
    assert.equal((await save('PATCH', update)).status, 400);
  // The framework may reject cross-origin writes before the route does.
  assert.ok(
    [400, 403].includes(
      (await save('PATCH', decision(3), users[0], 'https://other.example'))
        .status,
    ),
  );
  assert.equal((await read()).revision, 3);

  // Competing tabs cannot overwrite one another with the same revision.
  const writes = await Promise.all([
    save('PATCH', decision(3, 'dismissed')),
    save('PATCH', decision(3, 'acknowledged')),
  ]);
  assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await save('PATCH', decision(3, null))).status, 409);
  state = await read();
  assert.equal(state.revision, 4);
  const storedDecisions = state.actionDecisions;

  // Legacy note saves and client-supplied decision maps both preserve marks.
  const nextNotes = { synthetic: 'A later note' };
  assert.equal(
    (await save('PUT', { notes: nextNotes, reviewed, revision: 4 })).status,
    200,
  );
  assert.equal(
    (
      await save('PUT', {
        notes: nextNotes,
        reviewed,
        revision: 5,
        actionDecisions: {},
      })
    ).status,
    200,
  );
  state = await read();
  assert.deepEqual(state.actionDecisions, storedDecisions);
  assert.equal(state.revision, 6);

  assert.equal((await save('PATCH', decision(6, null))).status, 200);
  state = await read();
  assert.deepEqual(state.actionDecisions, {});
  assert.deepEqual(state.notes, nextNotes);
  assert.deepEqual(state.reviewed, reviewed);
  assert.equal(state.revision, 7);
  assert.equal((await read(users[1])).revision, 0);
  console.log(
    'PASS: HTTP acknowledge, dismiss and restore; persistent private preferences; tenant isolation; origin/input checks; concurrent writes; notes preserved.',
  );
} finally {
  for (const user of users) {
    if (user.id)
      await getPool().query(
        'delete from sunday_desk."user" where id=$1 and email=$2',
        [user.id, user.email],
      );
    else
      await getPool().query('delete from sunday_desk."user" where email=$1', [
        user.email,
      ]);
  }
  await getPool().end();
}
