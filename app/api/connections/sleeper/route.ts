import { getChatGPTUser } from '#dashboard-auth';
import {
  loadWorkspace,
  changeConnection,
  publicConnections,
  connectionRateLimit,
} from '@/lib/accounts/storage';
import { connectProvider } from '@/lib/accounts/providers';
import { retainLeagueSelection } from '@/lib/accounts/league-selection';
import {
  createConnectionPreview,
  confirmConnectionPreview,
} from '@/lib/accounts/connection-ticket';
import { bodyJSON, checkOrigin, privateHeaders } from '@/lib/accounts/request';
import { InputError } from '@/lib/accounts/errors';
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
        { error: 'Please wait a minute before trying again.' },
        { status: 429, headers: privateHeaders },
      );
    const body = await bodyJSON(request, 40000);
    if (body.action === 'confirm') {
      const preview = confirmConnectionPreview(
        user.userId,
        'sleeper',
        body.ticket,
        body.leagueIds,
      );
      await changeConnection(
        user.userId,
        'sleeper',
        preview.connection,
        preview.revision,
      );
      return Response.json(
        { connections: await publicConnections(user.userId) },
        { headers: privateHeaders },
      );
    }
    if (body.action !== 'discover')
      throw new InputError('Choose a Sleeper connection action.');
    const before = await loadWorkspace(user.userId);
    const connection = retainLeagueSelection(
      await connectProvider({ ...body, provider: 'sleeper' }),
      before.connections.find((c) => c.provider === 'sleeper'),
    );
    return Response.json(
      {
        leagues: connection.availableLeagues,
        selectedLeagueIds: connection.leagues.map((l) => l.id),
        ticket: createConnectionPreview(
          user.userId,
          connection,
          before.revision,
        ),
      },
      { headers: privateHeaders },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof InputError
            ? e.message
            : 'Could not connect Sleeper. Please try again shortly.',
      },
      { status: 400, headers: privateHeaders },
    );
  }
}
