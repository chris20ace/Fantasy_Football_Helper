import { getAuth } from './auth.ts';
import { getPool } from './db.ts';
import { recoveryEmailReady } from './email.ts';
import { appOrigin } from './origin.ts';
import { bodyJSON, checkOrigin, privateHeaders } from './request.ts';

export async function requestRecoveryVerification(request: Request) {
  const reply = (message: string, status: number) =>
    Response.json({ message }, { status, headers: privateHeaders });
  try {
    checkOrigin(request);
  } catch {
    return reply('Open Account settings in Sunday Desk and try again.', 403);
  }
  const auth = getAuth();
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session) return reply('Sign in to verify your recovery email.', 401);
  if (!recoveryEmailReady())
    return reply(
      'Recovery email is temporarily unavailable. Please try again later.',
      503,
    );
  const key = `sunday-desk:recovery:${session.user.id}`,
    now = Date.now();
  const limit = await getPool().query(
    'insert into sunday_desk."rateLimit" (id,key,count,"lastRequest") values($1,$1,1,$2) on conflict(key) do update set count=case when "rateLimit"."lastRequest"<$2-300000 then 1 else "rateLimit".count+1 end,"lastRequest"=case when "rateLimit"."lastRequest"<$2-300000 then $2 else "rateLimit"."lastRequest" end returning count',
    [key, now],
  );
  if (limit.rows[0].count > 5)
    return reply('Too many attempts. Wait five minutes and try again.', 429);
  let body: Record<string, unknown>;
  try {
    body = await bodyJSON(request, 2048);
  } catch {
    return reply('Submit a valid password form.', 400);
  }
  if (
    typeof body.currentPassword !== 'string' ||
    !body.currentPassword.length ||
    body.currentPassword.length > 128
  )
    return reply('Enter your current Sunday Desk password.', 400);
  try {
    await auth.api.verifyPassword({
      headers: request.headers,
      body: { password: body.currentPassword },
    });
  } catch {
    return reply('Your current password is incorrect. Please try again.', 400);
  }
  if (session.user.emailVerified)
    return reply('Your recovery email is already verified.', 200);
  try {
    await auth.api.sendVerificationEmail({
      headers: request.headers,
      body: {
        email: session.user.email,
        callbackURL: new URL('/account', appOrigin()).href,
      },
    });
    return reply(
      'Check your inbox for the confirmation link. It expires in 30 minutes.',
      200,
    );
  } catch {
    return reply(
      'We could not send the confirmation email. Please try again later.',
      503,
    );
  }
}
