export function appOrigin() {
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL)
    return 'https://' + process.env.VERCEL_URL;
  return process.env.BETTER_AUTH_URL;
}
