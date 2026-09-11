import { headers } from 'next/headers';
// Vercel Authentication must protect ALL deployments, including production.
// Trust that single-owner hosting boundary, never caller-supplied ChatGPT headers.
// A fresh clone fails closed until explicitly configured.
export async function getChatGPTUser() {
  await headers(); // Keep the page request-scoped and prevent prerendering.
  if (
    process.env.VERCEL !== '1' ||
    process.env.DASHBOARD_AUTH_MODE !== 'vercel-protection'
  )
    return null;
  return {
    userId: 'owner',
    displayName: 'Sunday Desk',
    email: '',
    fullName: null,
  };
}
export async function requireChatGPTUser(_returnTo: string) {
  const user = await getChatGPTUser();
  if (!user)
    throw new Error('Private dashboard authentication is not configured.');
  return user;
}
