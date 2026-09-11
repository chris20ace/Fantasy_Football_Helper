import { getChatGPTUser } from '#dashboard-auth';
import { getInsights } from '@/lib/fantasy/insights-server';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Sign in to your private workspace.' },
      { status: 401, headers },
    );
  const params = new URL(request.url).searchParams,
    league = params.get('league') ?? '',
    week = Number(params.get('week'));
  if (
    !/^(espn|sleeper):\d+$/.test(league) ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > 18
  )
    return Response.json(
      { error: 'Choose a connected league and week 1–18.' },
      { status: 400, headers },
    );
  try {
    return Response.json(
      await getInsights(
        user.userId,
        league,
        week,
        params.get('refresh') === '1',
      ),
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          'Insights could not refresh. Check the league connection, then try again.',
      },
      { status: 503, headers },
    );
  }
}
