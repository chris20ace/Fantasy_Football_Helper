import { InputError } from './errors.ts';
import { espnLeagueIds } from './espn-discovery.ts';
import type { ProviderConnection } from './types.ts';
type Json = Record<string, unknown>;
const normalize = (v: string) => v.replace(/[{}]/g, '').toLowerCase();
async function read(url: string, cookie?: string): Promise<unknown> {
  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    signal: AbortSignal.timeout(18000),
    redirect: 'error',
  });
  if (!r.ok)
    throw new InputError(
      r.status === 401 || r.status === 403
        ? 'ESPN could not verify this session. Sign in to ESPN and import your account again.'
        : 'The fantasy provider is temporarily unavailable. Try again shortly.',
    );
  if (!r.headers.get('content-type')?.includes('json'))
    throw new InputError(
      'The provider returned a sign-in page. Reconnect your account.',
    );
  return r.json();
}
export async function connectProvider(body: Json): Promise<ProviderConnection> {
  const state = (await read('https://api.sleeper.app/v1/state/nfl')) as Json;
  const season = Number(state.league_season ?? state.season);
  if (!Number.isInteger(season) || season < 2020 || season > 2100)
    throw new InputError('NFL season information is temporarily unavailable.');
  if (body.provider === 'sleeper') {
    const username =
      typeof body.username === 'string' ? body.username.trim() : '';
    if (!/^[A-Za-z0-9_]{1,40}$/.test(username))
      throw new InputError('Enter your Sleeper username, without an @ sign.');
    const account = (await read(
      'https://api.sleeper.app/v1/user/' + encodeURIComponent(username),
    )) as Json | null;
    if (!account || typeof account.user_id !== 'string')
      throw new InputError('No Sleeper account matched that username.');
    const raw = await read(
      'https://api.sleeper.app/v1/user/' +
        account.user_id +
        '/leagues/nfl/' +
        season,
    );
    if (!Array.isArray(raw))
      throw new InputError('Sleeper could not load your leagues.');
    if (raw.length > 30)
      throw new InputError('This workspace supports up to 30 Sleeper leagues.');
    const leagues = raw
      .filter((l) => l.sport === 'nfl' && String(l.season) === String(season))
      .map((l) => ({ id: String(l.league_id), name: String(l.name), season }));
    if (!leagues.length)
      throw new InputError(
        'No NFL leagues were found for this account in ' +
          season +
          '. Check the username or try after your leagues renew.',
      );
    return {
      provider: 'sleeper',
      accountId: account.user_id,
      label: typeof account.username === 'string' ? account.username : username,
      leagues,
      updatedAt: new Date().toISOString(),
    };
  }
  if (body.provider === 'espn') {
    const s2 = typeof body.s2 === 'string' ? body.s2.trim() : '',
      swid = typeof body.swid === 'string' ? body.swid.trim() : '';
    if (
      s2.length < 20 ||
      s2.length > 6000 ||
      /[;\s]/.test(s2) ||
      s2.split('').some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      throw new InputError('Paste the complete espn_s2 cookie value.');
    if (
      !/^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(
        swid,
      )
    )
      throw new InputError('Paste the SWID value, including the dashes.');
    let ids = Array.isArray(body.leagueIds)
      ? [...new Set(body.leagueIds.map(String))]
      : [];
    if (!ids.length) {
      ids = espnLeagueIds(
        await read(
          'https://fan.api.espn.com/apis/v2/fans/' +
            encodeURIComponent(swid) +
            '?context=fantasy',
          'espn_s2=' + s2 + '; SWID=' + swid,
        ),
        season,
      );
    }
    if (
      !ids.length ||
      ids.length > 20 ||
      ids.some((id) => !/^\d{1,20}$/.test(id))
    )
      throw new InputError('Enter 1–20 league IDs, separated by commas.');
    const leagues = await Promise.all(
      ids.map(async (id) => {
        const league = (await read(
          'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/' +
            season +
            '/segments/0/leagues/' +
            id +
            '?view=mSettings&view=mTeam',
          'espn_s2=' + s2 + '; SWID=' + swid,
        )) as {
          settings?: { name?: string };
          teams?: {
            owners?: string[];
            name?: string;
            location?: string;
            nickname?: string;
            abbrev?: string;
          }[];
        };
        if (
          !league.teams?.some((t) =>
            t.owners?.some((o) => normalize(o) === normalize(swid)),
          )
        )
          throw new InputError(
            'Your ESPN account is not a member of league ' +
              id +
              '. Check the league ID and SWID.',
          );
        const myTeam = league.teams?.find((t) =>
          t.owners?.some((o) => normalize(o) === normalize(swid)),
        );
        return {
          id,
          name: league.settings?.name ?? 'ESPN league ' + id,
          season,
          teamName:
            myTeam?.name ||
            [myTeam?.location, myTeam?.nickname].filter(Boolean).join(' ') ||
            myTeam?.abbrev ||
            undefined,
        };
      }),
    );
    return {
      provider: 'espn',
      accountId: normalize(swid),
      label: 'ESPN Fantasy',
      credentials: { s2, swid },
      leagues,
      updatedAt: new Date().toISOString(),
    };
  }
  throw new InputError('Choose Sleeper or ESPN.');
}
