import { InputError } from '@/lib/accounts/errors';
import { getChatGPTUser } from '#dashboard-auth';
import {
  loadWorkspace,
  publicConnections,
  changeConnection,
  connectionRateLimit,
  claimWorkspace,
} from '@/lib/accounts/storage';
import { connectProvider } from '@/lib/accounts/providers';
import { checkOrigin, bodyJSON, privateHeaders } from '@/lib/accounts/request';
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Sign in required.' },
      { status: 401, headers: privateHeaders },
    );
  return Response.json(
    { connections: await publicConnections(user.userId) },
    { headers: privateHeaders },
  );
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Sign in required.' },
      { status: 401, headers: privateHeaders },
    );
  try {
    checkOrigin(request);
    if (!(await connectionRateLimit(user.userId)))
      return Response.json(
        { error: 'Please wait a minute before trying another connection.' },
        { status: 429, headers: privateHeaders },
      );
    const body = await bodyJSON(request);
    if (body.action === 'claim') {
      if (
        typeof body.token !== 'string' ||
        !/^[A-Za-z0-9_-]{40,100}$/.test(body.token)
      )
        throw new Error('This restore link is invalid.');
      await claimWorkspace(user.userId, body.token);
    } else {
      const before = await loadWorkspace(user.userId);
      if (body.action === 'disconnect') {
        if (!['sleeper', 'espn'].includes(String(body.provider)))
          throw new Error('Choose an account to disconnect.');
        await changeConnection(
          user.userId,
          String(body.provider),
          null,
          before.revision,
        );
      } else {
        const connection = await connectProvider(body);
        await changeConnection(
          user.userId,
          connection.provider,
          connection,
          before.revision,
        );
      }
    }
    return Response.json(
      { connections: await publicConnections(user.userId) },
      { headers: privateHeaders },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof InputError
            ? e.message
            : 'Could not update this connection. Please try again shortly.',
      },
      { status: 400, headers: privateHeaders },
    );
  }
}
