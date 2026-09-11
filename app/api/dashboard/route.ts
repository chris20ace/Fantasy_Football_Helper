import { getChatGPTUser } from '#dashboard-auth';
import { getDashboard } from '@/lib/fantasy/server';
export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json(
      { error: 'Sign in to your private workspace.' },
      { status: 401 },
    );
  const params = new URL(request.url).searchParams,
    raw = params.get('week'),
    week = raw === null ? undefined : Number(raw);
  if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18))
    return Response.json(
      { error: 'Choose an NFL week from 1 to 18.' },
      { status: 400 },
    );
  try {
    return Response.json(
      await getDashboard(week, params.get('refresh') === '1'),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return Response.json(
      {
        error:
          'The live data service could not refresh. Your saved league data is safe. Please try again shortly.',
      },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
