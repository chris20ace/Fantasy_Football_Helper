import { appOrigin } from './origin.ts';
import { betterAuth } from 'better-auth';
import { waitUntil } from '@vercel/functions';
import { getPool } from './db.ts';
import { recoveryEmailReady, sendAccountEmail } from './email.ts';
function createAuth() {
  const baseURL = appOrigin();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!baseURL || !secret || secret.length < 32)
    throw new Error('Account sign-in is not configured.');
  return betterAuth({
    appName: 'Sunday Desk',
    baseURL,
    secret,
    database: getPool(),
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: recoveryEmailReady()
        ? async ({ user, token }) => {
            // Legacy signup addresses are identifiers, not proven recovery addresses.
            if (user.emailVerified)
              await sendAccountEmail(user.email, 'reset', token);
          }
        : undefined,
    },
    emailVerification: {
      sendOnSignUp: false,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 1800,
      sendVerificationEmail: recoveryEmailReady()
        ? async ({ user, token }) => {
            await sendAccountEmail(user.email, 'verify', token);
          }
        : undefined,
    },
    // Recovery enrollment goes through our session + current-password guard.
    disabledPaths: ['/send-verification-email'],
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 600, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 },
        '/verify-email': { window: 60, max: 10 },
      },
    },
    advanced: {
      backgroundTasks: process.env.VERCEL ? { handler: waitUntil } : undefined,
      cookiePrefix: 'sunday-desk',
      ipAddress: {
        ipAddressHeaders: process.env.VERCEL
          ? ['x-real-ip']
          : ['x-forwarded-for'],
      },
    },
    telemetry: { enabled: false },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}
