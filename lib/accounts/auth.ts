import { appOrigin } from './origin.ts';
import { betterAuth } from 'better-auth';
import { getPool } from './db.ts';
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
    },
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
      },
    },
    advanced: {
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
