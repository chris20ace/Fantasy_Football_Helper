/* Upstream providers return polymorphic JSON. This boundary normalizes it into strict League/Player types. */
/* oxlint-disable typescript/no-explicit-any */
import { fromESPN, fromSleeper } from './providers.ts';
import { gameStatuses } from './game-status.ts';
export {
  fromESPN,
  fromSleeper,
  espnPlayer,
  gameInfo,
  sleeperEligible,
} from './providers.ts';
import { loadWorkspace, readCache, saveCache } from '#dashboard-runtime';
export { getPreferences, putPreferences } from '#dashboard-runtime';
import type { Dashboard, League } from './types';

type Raw = Record<string, any>;
const SLEEPER = 'https://api.sleeper.app';
const ESPN = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
export async function json(
  url: string,
  cookie?: string,
  filter?: unknown,
): Promise<any> {
  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(filter ? { 'X-Fantasy-Filter': JSON.stringify(filter) } : {}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(18000),
  });
  if (!r.ok)
    throw new Error(
      r.status === 401 || r.status === 403
        ? 'Connection expired. Reconnect your ESPN session.'
        : `Provider unavailable (${r.status}). Try refreshing shortly.`,
    );
  const type = r.headers.get('content-type') ?? '';
  if (!type.includes('json'))
    throw new Error(
      'Provider returned a sign-in page. Reconnect your ESPN session.',
    );
  return r.json();
}
export async function cached(
  key: string,
  ttl: number,
  fn: () => Promise<any>,
  force = false,
) {
  const c = await readCache(key);
  if (c && !force && Date.now() - c.updated < ttl) return JSON.parse(c.value);
  const value = await fn();
  await saveCache(key, value);
  return value;
}

export async function addGameStatuses(
  proTeams: Raw[],
  season: number,
  week: number,
) {
  let states: ReturnType<typeof gameStatuses> = {};
  try {
    const board = await cached(
      `nfl-game-status-v1:${season}:${week}`,
      60000,
      () =>
        json(
          `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?region=us&lang=en&contentorigin=espn&limit=100&dates=${season}&week=${week}&seasontype=2`,
        ),
    );
    states = gameStatuses(board, season, week);
  } catch {
    /* Unknown status stays unknown; never infer a final from kickoff. */
  }
  return proTeams.map((team) => ({
    ...team,
    proGamesByScoringPeriod: {
      ...team.proGamesByScoringPeriod,
      [String(week)]: (team.proGamesByScoringPeriod?.[String(week)] ?? []).map(
        (game: Raw) => {
          const state = states[String(game.id)];
          return {
            ...game,
            gameStatus:
              state?.home === String(game.homeProTeamId) &&
              state?.away === String(game.awayProTeamId)
                ? state.status
                : 'unknown',
          };
        },
      ),
    },
  }));
}

// The full player catalog is streamed one entry at a time to stay within Workers memory limits.
export async function catalog(
  ids: Set<string>,
  force = false,
  namespace = 'public',
  owner: string | null = null,
): Promise<Record<string, Raw>> {
  const existing = await readCache(namespace + ':player-catalog', owner);
  if (existing && !force && Date.now() - existing.updated < 180000) {
    const v = JSON.parse(existing.value);
    if ([...ids].every((id) => v[id])) return v;
  }
  const response = await fetch(`${SLEEPER}/v1/players/nfl`, {
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok || !response.body)
    throw new Error('Sleeper player details are temporarily unavailable.');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const result: Record<string, Raw> = {};
  let depth = 0,
    inString = false,
    escaped = false,
    pair = '';
  const consume = () => {
    const match = pair.match(/^\s*"([^"]+)"\s*:/);
    if (match && ids.has(match[1])) {
      const raw = JSON.parse(`{${pair}}`)[match[1]];
      result[match[1]] = {
        player_id: raw.player_id,
        first_name: raw.first_name,
        last_name: raw.last_name,
        full_name: raw.full_name,
        team: raw.team,
        position: raw.position,
        fantasy_positions: raw.fantasy_positions,
        injury_status: raw.injury_status,
        espn_id: raw.espn_id,
      };
    }
    pair = '';
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const ch of value) {
      if (!inString && depth === 0 && ch === '{') {
        depth = 1;
        continue;
      }
      if (!inString && depth === 1 && (ch === ',' || ch === '}')) {
        consume();
        if (ch === '}') depth = 0;
        continue;
      }
      pair += ch;
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
    }
  }
  await saveCache(namespace + ':player-catalog', result, owner);
  return result;
}

export async function getDashboard(
  userId: string,
  weekInput: number | undefined,
  refresh = false,
): Promise<Dashboard> {
  const workspace = await loadWorkspace(userId);
  const configured = workspace.connections.flatMap((c) =>
    c.leagues.map((l) => ({ ...l, platform: c.provider })),
  );
  const sleeperUserId =
    workspace.connections.find((c) => c.provider === 'sleeper')?.accountId ??
    '';
  const espn = workspace.connections.find((c) => c.provider === 'espn');
  const namespace =
    'user-lineup-v4:' + encodeURIComponent(userId) + ':' + workspace.revision;
  if (!configured.length)
    return {
      season: new Date().getFullYear(),
      week: weekInput ?? 1,
      currentWeek: 1,
      fetchedAt: new Date().toISOString(),
      leagues: [],
      warnings: [],
    };
  const warnings: string[] = [];
  let degraded = false;
  const shared = async (
    key: string,
    ttl: number,
    fetcher: () => Promise<any>,
  ) => {
    try {
      return await cached(key, ttl, fetcher);
    } catch (e) {
      const old = await readCache(key);
      if (!old) throw e;
      degraded = true;
      warnings.push(
        'Shared NFL schedule or season data could not refresh. Cached information is shown and lineup advice is paused.',
      );
      return JSON.parse(old.value);
    }
  };
  const state = await shared('nfl-state', 300000, () =>
    json(`${SLEEPER}/v1/state/nfl`),
  );
  const season = Number(state.league_season ?? state.season),
    currentWeek = Math.max(
      1,
      Math.min(18, Number(state.display_week ?? state.week) || 1),
    ),
    week = weekInput ?? currentWeek;
  const allCache = await readCache(
    `${namespace}:dashboard:${season}:${week}`,
    userId,
  );
  if (
    allCache &&
    !degraded &&
    Date.now() - allCache.updated < (refresh ? 20000 : 180000)
  )
    return JSON.parse(allCache.value);
  const proData = await shared(`schedule:${season}`, 3600000, () =>
    json(`${ESPN}/${season}?view=proTeamSchedules_wl`),
  );
  const proTeams = await addGameStatuses(
    proData.settings?.proTeams ?? [],
    season,
    week,
  );
  const s2 = espn?.credentials?.s2,
    swid = espn?.credentials?.swid ?? '',
    cookie = s2 && swid ? `espn_s2=${s2}; SWID=${swid}` : undefined;
  const raw = await Promise.allSettled(
    configured.map(async (t) =>
      t.season !== season
        ? Promise.reject(
            new Error(
              'Reconnect this account to import leagues for the current season.',
            ),
          )
        : t.platform === 'espn'
          ? !cookie
            ? Promise.reject(new Error('ESPN needs a session connection.'))
            : json(
                `${ESPN}/${season}/segments/0/leagues/${t.id}?view=mSettings&view=mTeam&view=mRoster&view=mMatchupScore&view=mStandings&view=mDraftDetail&scoringPeriodId=${week}`,
                cookie,
              )
          : Promise.all([
              json(`${SLEEPER}/v1/league/${t.id}`),
              json(`${SLEEPER}/v1/league/${t.id}/rosters`),
              json(`${SLEEPER}/v1/league/${t.id}/matchups/${week}`),
              json(`${SLEEPER}/v1/league/${t.id}/users`),
            ]),
    ),
  );
  const ids = new Set<string>();
  raw.forEach((r, i) => {
    if (r.status === 'fulfilled' && configured[i].platform === 'sleeper') {
      const roster = r.value[1].find(
        (r: Raw) =>
          r.owner_id === sleeperUserId ||
          (r.co_owners ?? []).includes(sleeperUserId),
      );
      const matches = r.value[2] as Raw[];
      const me = matches.find((m) => m.roster_id === roster?.roster_id);
      const peers =
        me?.matchup_id != null
          ? matches.filter(
              (m) =>
                m.matchup_id === me.matchup_id &&
                m.roster_id !== roster?.roster_id,
            )
          : [];
      const opponent = peers.length === 1 ? peers[0] : undefined;
      for (const id of [
        ...(roster?.players ?? []),
        ...(me?.starters ?? []),
        ...(opponent?.starters ?? []),
      ])
        if (id && id !== '0') ids.add(String(id));
    }
  });
  let details: Record<string, Raw> = {},
    projections: Raw[] = [];
  const sources = await Promise.allSettled([
    ids.size ? catalog(ids, refresh, namespace, userId) : Promise.resolve({}),
    ids.size
      ? json(
          `${SLEEPER}/projections/nfl/${season}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF`,
        ).then((rows: Raw[]) => rows.filter((p) => ids.has(p.player_id)))
      : Promise.resolve([]),
  ]);
  if (sources[0].status === 'fulfilled') details = sources[0].value;
  else
    warnings.push(
      'Sleeper player details could not refresh. Cross-platform exposure may be incomplete.',
    );
  if (sources[1].status === 'fulfilled') projections = sources[1].value;
  else
    warnings.push(
      'Sleeper weekly projections are unavailable. Try refreshing later.',
    );
  const leagues = await Promise.all(
    raw.map(async (r, i) => {
      const target = configured[i],
        key = `${namespace}:league:${season}:${week}:${target.platform}:${target.id}`;
      try {
        if (r.status === 'rejected') throw r.reason;
        const league =
          target.platform === 'espn'
            ? fromESPN(r.value, swid, proTeams, week, season)
            : fromSleeper(
                r.value[0],
                r.value[1],
                r.value[2],
                r.value[3],
                details,
                projections,
                proTeams,
                week,
                season,
                currentWeek,
                sleeperUserId,
              );
        if (target.platform === 'sleeper' && sources[0].status === 'rejected') {
          league.warnings.push(
            'Player injury details could not refresh. Verify status in Sleeper.',
          );
          league.players.forEach((p) => {
            p.locked = null;
          });
        }
        if (degraded) {
          league.stale = true;
          league.warnings.push(...warnings);
        }
        await saveCache(key, league, userId);
        return league;
      } catch (e) {
        const old = await readCache(key, userId),
          message =
            e instanceof Error ? e.message : 'This league could not refresh.';
        if (old)
          return {
            ...JSON.parse(old.value),
            stale: true,
            error: message,
          } as League;
        return {
          id: `${target.platform}:${target.id}`,
          platform: target.platform,
          name: target.name,
          teamName: 'Connection needs attention',
          url:
            target.platform === 'espn'
              ? `https://fantasy.espn.com/football/league?leagueId=${target.id}`
              : `https://sleeper.com/leagues/${target.id}`,
          status: 'unavailable',
          season,
          week,
          currentWeek,
          fetchedAt: new Date().toISOString(),
          scoring: '—',
          source: target.platform,
          players: [],
          slots: [],
          standings: [],
          record: '—',
          actual: null,
          matchupProjection: null,
          opponent: null,
          warnings: [],
          error: message,
        } as League;
      }
    }),
  );
  const dashboard = {
    season,
    week,
    currentWeek,
    fetchedAt: new Date().toISOString(),
    leagues,
    warnings,
  };
  await saveCache(
    `${namespace}:dashboard:${season}:${week}`,
    dashboard,
    userId,
  );
  return dashboard;
}
