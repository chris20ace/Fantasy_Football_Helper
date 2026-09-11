import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getAuth } from '../lib/accounts/auth.ts';
import { getPool } from '../lib/accounts/db.ts';
import {
  loadWorkspace,
  changeConnection,
  readCache,
  saveCache,
  getPreferences,
  putPreferences,
} from '../lib/accounts/storage.ts';
if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_URL)
  throw new Error('Use a configured test environment.');
const auth = getAuth(),
  origin = process.env.BETTER_AUTH_URL,
  emails = [],
  ids = [],
  cookies = [];
const request = (path, body, cookie) =>
  auth.handler(
    new Request(origin + '/api/auth/' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
try {
  for (let i = 0; i < 2; i++) {
    const email = 'validation-' + randomUUID() + '@example.test',
      password = randomUUID() + '-test-password';
    emails.push(email);
    let r = await request('sign-up/email', {
      email,
      password,
      name: 'Integration validation',
    });
    assert.equal(r.status, 200);
    r = await request('sign-in/email', { email, password });
    assert.equal(r.status, 200);
    ids.push((await r.json()).user.id);
    cookies.push(
      r.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; '),
    );
  }
  assert.equal((await loadWorkspace(ids[0])).connections.length, 0);
  const fake = {
    provider: 'sleeper',
    accountId: 'synthetic',
    label: 'Test',
    leagues: [
      { id: 'synthetic-league', name: 'Synthetic league', season: 2026 },
    ],
    updatedAt: new Date().toISOString(),
  };
  await changeConnection(ids[0], 'sleeper', fake, 'empty');
  assert.equal((await loadWorkspace(ids[1])).connections.length, 0);
  const before = await loadWorkspace(ids[0]);
  await changeConnection(ids[0], 'sleeper', null, before.revision);
  assert.notEqual((await loadWorkspace(ids[0])).revision, before.revision);
  await assert.rejects(
    changeConnection(ids[0], 'sleeper', fake, before.revision),
  );
  await saveCache('test:' + ids[0], { roster: 'private' }, ids[0]);
  assert.equal(await readCache('test:' + ids[0], ids[1]), null);
  const writes = await Promise.all([
    putPreferences(ids[0], { notes: { draft: 'one' }, reviewed: {} }, 0),
    putPreferences(ids[0], { notes: { draft: 'two' }, reviewed: {} }, 0),
  ]);
  assert.equal(writes.filter((v) => v === 1).length, 1);
  assert.equal(writes.filter((v) => v === null).length, 1);
  assert.deepEqual((await getPreferences(ids[1])).notes, {});
  assert.equal((await request('sign-out', {}, cookies[0])).status, 200);
  assert.equal(
    await (await request('get-session', null, cookies[0])).json(),
    null,
  );
  console.log(
    'Account integration passed: authentication, revocation, empty accounts, tenant isolation, connection revisions and concurrent note saves.',
  );
} finally {
  for (const email of emails)
    await getPool().query('delete from sunday_desk."user" where email=$1', [
      email,
    ]);
  await getPool().end();
}
