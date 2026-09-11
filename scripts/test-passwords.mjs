import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getAuth } from '../lib/accounts/auth.ts';
import { getPool } from '../lib/accounts/db.ts';
import { requestRecoveryVerification } from '../lib/accounts/recovery.ts';
import { getPreferences, putPreferences } from '../lib/accounts/storage.ts';

if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_URL)
  throw new Error('Use a configured test database.');
// Capture mail at the network boundary. No actual emails or live API key are used.
process.env.RESEND_API_KEY = 'password-test-key';
process.env.AUTH_EMAIL_PROVIDER = 'resend';
process.env.AUTH_EMAIL_FROM = 'Sunday Desk <no-reply@example.test>';
const originalFetch = globalThis.fetch,
  deliveries = [];
globalThis.fetch = async (input, init) => {
  assert.equal(String(input), 'https://api.resend.com/emails');
  assert.equal(init.headers.Authorization, 'Bearer password-test-key');
  const email = JSON.parse(init.body);
  assert.ok(email.to.every((to) => to.endsWith('@example.test')));
  assert.ok(!JSON.stringify(email).includes('password-test-key'));
  deliveries.push(email);
  return Response.json({ id: randomUUID() });
};
const origin = process.env.BETTER_AUTH_URL,
  auth = getAuth(),
  ids = [],
  emails = [];
const headers = (cookie) => ({
  origin,
  'content-type': 'application/json',
  'x-forwarded-for': '198.51.100.201',
  ...(cookie ? { cookie } : {}),
});
const request = (path, body, cookie) =>
  auth.handler(
    new Request(origin + '/api/auth/' + path, {
      method: body ? 'POST' : 'GET',
      headers: headers(cookie),
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
const cookieOf = (response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
const enroll = (cookie, currentPassword, extra = {}) =>
  requestRecoveryVerification(
    new Request(origin + '/api/account/verify-recovery-email', {
      method: 'POST',
      headers: headers(cookie),
      body: JSON.stringify({ currentPassword, ...extra }),
    }),
  );
const tokenOf = (email) => {
  const url = new URL(email.text.match(/https?:\/\/\S+/)[0]);
  assert.equal(url.origin, origin);
  assert.equal(url.search, '');
  return new URLSearchParams(url.hash.slice(1)).get('token');
};
const sessionOf = async (cookie) =>
  (await request('get-session', null, cookie)).json();
try {
  for (let i = 0; i < 2; i++) {
    const email = `password-${randomUUID()}@example.test`,
      password = randomUUID() + '-Initial';
    emails.push(email);
    const signup = await request('sign-up/email', {
      email,
      password,
      name: 'Password test',
    });
    assert.equal(signup.status, 200);
    ids.push((await signup.json()).user.id);
    emails[i] = { email, password };
  }
  const one = emails[0],
    two = emails[1];
  let r = await request('sign-in/email', one);
  assert.equal(r.status, 200);
  let cookieA = cookieOf(r);
  r = await request('sign-in/email', one);
  assert.equal(r.status, 200);
  const otherA = cookieOf(r);
  r = await request('sign-in/email', two);
  assert.equal(r.status, 200);
  const cookieB = cookieOf(r);
  await putPreferences(
    ids[0],
    { notes: { test: 'Keep my private team notes' }, reviewed: {} },
    0,
  );
  assert.equal(
    (await request('send-verification-email', { email: one.email }, cookieA))
      .status,
    404,
  );
  assert.equal((await enroll(null, one.password)).status, 401);
  const foreign = new Request(origin + '/api/account/verify-recovery-email', {
    method: 'POST',
    headers: { ...headers(cookieA), origin: 'https://foreign.example' },
    body: JSON.stringify({ currentPassword: one.password }),
  });
  assert.equal((await requestRecoveryVerification(foreign)).status, 403);
  assert.equal((await enroll(cookieA, 'wrong-password-value')).status, 400);
  const existing = await request('request-password-reset', {
    email: one.email,
    redirectTo: origin + '/reset-password',
  });
  const unknown = await request('request-password-reset', {
    email: `missing-${randomUUID()}@example.test`,
    redirectTo: origin + '/reset-password',
  });
  assert.equal(existing.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(await existing.json(), await unknown.json());
  assert.equal(
    deliveries.length,
    0,
    'Unverified and unknown accounts receive no reset email',
  );
  assert.equal(
    (
      await enroll(cookieA, one.password, {
        email: two.email,
        callbackURL: 'https://foreign.example',
      })
    ).status,
    200,
  );
  assert.equal(deliveries.length, 1);
  assert.deepEqual(
    deliveries[0].to,
    [one.email],
    'Enrollment email is derived from authenticated account',
  );
  const verification = tokenOf(deliveries[0]);
  assert.equal(
    (await request('verify-email?token=' + encodeURIComponent(verification)))
      .status,
    200,
  );
  assert.equal((await sessionOf(cookieA)).user.emailVerified, true);
  assert.equal((await sessionOf(cookieB)).user.emailVerified, false);

  const changed = randomUUID() + '-Changed';
  assert.equal(
    (
      await request(
        'change-password',
        {
          currentPassword: 'wrong-password',
          newPassword: changed,
          revokeOtherSessions: true,
        },
        cookieA,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        'change-password',
        {
          currentPassword: one.password,
          newPassword: 'short',
          revokeOtherSessions: true,
        },
        cookieA,
      )
    ).status,
    400,
  );
  r = await request(
    'change-password',
    {
      currentPassword: one.password,
      newPassword: changed,
      revokeOtherSessions: true,
    },
    cookieA,
  );
  assert.equal(r.status, 200);
  const oldCookie = cookieA;
  cookieA = cookieOf(r);
  assert.equal(await sessionOf(oldCookie), null);
  assert.equal(await sessionOf(otherA), null);
  assert.equal((await sessionOf(cookieA)).user.id, ids[0]);
  assert.equal((await request('sign-in/email', one)).status, 401);
  assert.equal(
    (await sessionOf(cookieB)).user.id,
    ids[1],
    'Other accounts remain signed in',
  );
  // Clear only this test IP's reset limiter so the next cases exercise token behavior.
  await getPool().query(
    'delete from sunday_desk."rateLimit" where key like $1',
    ['%198.51.100.201%'],
  );
  assert.equal(
    (
      await request('request-password-reset', {
        email: one.email,
        redirectTo: origin + '/reset-password',
      })
    ).status,
    200,
  );
  const expiredToken = tokenOf(deliveries.at(-1));
  await getPool().query(
    'update sunday_desk.verification set "expiresAt"=now()-interval \'1 minute\' where identifier=$1',
    ['reset-password:' + expiredToken],
  );
  const resetPassword = randomUUID() + '-Reset';
  assert.equal(
    (
      await request('reset-password', {
        token: expiredToken,
        newPassword: resetPassword,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('request-password-reset', {
        email: one.email,
        redirectTo: origin + '/reset-password',
      })
    ).status,
    200,
  );
  const resetToken = tokenOf(deliveries.at(-1));
  const reset = await request('reset-password', {
    token: resetToken,
    newPassword: resetPassword,
  });
  assert.equal(reset.status, 200);
  assert.equal(
    (
      await request('reset-password', {
        token: resetToken,
        newPassword: randomUUID() + '-Again',
      })
    ).status,
    400,
  );
  assert.equal(
    await sessionOf(cookieA),
    null,
    'Reset revokes the current session too',
  );
  assert.equal(
    (await request('sign-in/email', { email: one.email, password: changed }))
      .status,
    401,
  );
  assert.equal(
    (
      await request('sign-in/email', {
        email: one.email,
        password: resetPassword,
      })
    ).status,
    200,
  );
  assert.equal(
    (await getPreferences(ids[0])).notes.test,
    'Keep my private team notes',
  );
  assert.equal((await sessionOf(cookieB)).user.id, ids[1]);
  for (let i = 0; i < 5; i++)
    assert.equal((await enroll(cookieB, 'wrong-password-value')).status, 400);
  assert.equal(
    (await enroll(cookieB, two.password)).status,
    429,
    'Enrollment is persistently rate limited',
  );
  console.log(
    'PASS: recovery enrollment, non-enumeration, current-password proof, account isolation, expired and single-use reset links, old-session revocation, native password validation, and preserved private data. Mail was captured; no emails sent.',
  );
} finally {
  globalThis.fetch = originalFetch;
  for (const id of ids) {
    await getPool().query(
      'delete from sunday_desk.verification where value=$1',
      [id],
    );
    await getPool().query('delete from sunday_desk."rateLimit" where key=$1', [
      'sunday-desk:recovery:' + id,
    ]);
    await getPool().query('delete from sunday_desk."user" where id=$1', [id]);
  }
  await getPool().query(
    'delete from sunday_desk."rateLimit" where key like $1',
    ['%198.51.100.201%'],
  );
  await getPool().end();
}
