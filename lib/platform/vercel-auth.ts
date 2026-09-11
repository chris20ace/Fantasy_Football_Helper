import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '../accounts/auth.ts';
export async function getChatGPTUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    userId: session.user.id,
    displayName: session.user.name,
    email: session.user.email,
    fullName: session.user.name,
  };
}
export async function requireChatGPTUser(returnTo: string) {
  const user = await getChatGPTUser();
  if (!user)
    redirect(
      '/login?next=' +
        encodeURIComponent(
          returnTo.startsWith('/') && !returnTo.startsWith('//')
            ? returnTo
            : '/',
        ),
    );
  return user;
}
