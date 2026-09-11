/* Upstream providers return polymorphic JSON. This boundary normalizes it into strict League/Player types. */
/* oxlint-disable typescript/no-explicit-any */
import { scoreSleeper } from './scoring';
import { setting, readCache, saveCache } from '#dashboard-runtime';
export { getPreferences, putPreferences } from '#dashboard-runtime';
import type { Dashboard, League, Player, Slot, Standing } from './types';

type Raw = Record<string, any>;
const SLEEPER = 'https://api.sleeper.app';
const ESPN = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
const USER = '734846853182521344';
const configured = [
  { id: '626895972', platform: 'espn', name: 'IU' },
  { id: '1360778906', platform: 'espn', name: 'BTOWNS FINEST' },
  { id: '103664', platform: 'espn', name: 'Charlie Ruff Memorial League' },
  { id: '1399588599548145664', platform: 'sleeper', name: 'big dick cig' },
  {
    id: '1389374537983889408',
    platform: 'sleeper',
    name: 'Charlie Ruff Memorial League',
  },
  { id: '1384960790922039296', platform: 'sleeper', name: 'Helmet Heads' },
  {
    id: '1352065380138377216',
    platform: 'sleeper',
    name: 'Steph is Lebrons Dad',
  },
] as const;
const numeric = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? n : null;
const normalize = (v: unknown) =>
  (typeof v === 'string' ? v : '').replace(/[{}]/g, '').toLowerCase();
const abbreviation = (v: string) =>
  ({ WSH: 'WAS', JAC: 'JAX', LA: 'LAR' })[v] ?? v;
async function json(url: string, cookie?: string): Promise<any> {
  const r = await fetch(url, {
    headers: cookie
      ? { Cookie: cookie, Accept: 'application/json' }
      : { Accept: 'application/json' },
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
async function cached(
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

// The full player catalog is streamed one entry at a time to stay within Workers memory limits.
async function catalog(
  ids: Set<string>,
  force = false,
): Promise<Record<string, Raw>> {
  const existing = await readCache('player-catalog');
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
  await saveCache('player-catalog', result);
  return result;
}

function gameInfo(team: string, proTeams: Raw[], week: number) {
  const pro = proTeams.find(
    (t) => abbreviation(t.abbrev) === abbreviation(team),
  );
  const game = pro?.proGamesByScoringPeriod?.[String(week)]?.[0];
  const other =
    game && pro
      ? proTeams.find(
          (t) =>
            t.id ===
            (game.homeProTeamId === pro.id
              ? game.awayProTeamId
              : game.homeProTeamId),
        )
      : null;
  return {
    bye: pro?.byeWeek === week,
    kickoff:
      game && !game.startTimeTBD && game.validForLocking !== false
        ? numeric(game.date)
        : null,
    opponent: other
      ? `${game.homeProTeamId === pro?.id ? 'vs' : '@'} ${abbreviation(other.abbrev)}`
      : '',
  };
}
const espnSlot: Record<string, string> = {
  '0': 'QB',
  '1': 'TQB',
  '2': 'RB',
  '3': 'RB/WR',
  '4': 'WR',
  '5': 'WR/TE',
  '6': 'TE',
  '7': 'SUPERFLEX',
  '8': 'DT',
  '9': 'DE',
  '10': 'LB',
  '11': 'DL',
  '12': 'CB',
  '13': 'S',
  '14': 'DB',
  '15': 'IDP',
  '16': 'D/ST',
  '17': 'K',
  '23': 'FLEX',
};
const positions: Record<string, string> = {
  '1': 'QB',
  '2': 'RB',
  '3': 'WR',
  '4': 'TE',
  '5': 'K',
  '16': 'DEF',
  '6': 'DT',
  '7': 'DE',
  '8': 'LB',
  '9': 'CB',
  '10': 'S',
  '11': 'DL',
  '12': 'DB',
};
function makeSlots(counts: Raw): Slot[] {
  return Object.entries(counts)
    .filter(([k, v]) => !['20', '21', '24'].includes(k) && Number(v) > 0)
    .flatMap(([key, count]) =>
      Array.from({ length: Number(count) }, (_, i) => ({
        id: `${key}:${i}`,
        key,
        label: espnSlot[key] ?? `Slot ${key}`,
      })),
    );
}
function espnPlayer(
  entry: Raw,
  proTeams: Raw[],
  week: number,
  season: number,
  currentWeek: number,
  slot: string | null,
): Player {
  const pool = entry.playerPoolEntry ?? {},
    p = pool.player ?? {},
    team = abbreviation(
      proTeams.find((t) => t.id === p.proTeamId)?.abbrev ?? 'FA',
    );
  const stat = (source: number) =>
    (p.stats ?? []).find(
      (s: Raw) =>
        s.seasonId === season &&
        s.scoringPeriodId === week &&
        s.statSourceId === source &&
        s.statSplitTypeId === 1,
    );
  const info = gameInfo(team, proTeams, week),
    position = positions[String(p.defaultPositionId)] ?? '—';
  const locked =
    week === currentWeek && typeof pool.lineupLocked === 'boolean'
      ? pool.lineupLocked
      : info.kickoff !== null
        ? info.kickoff <= Date.now()
        : info.bye
          ? false
          : null;
  return {
    id: String(p.id ?? entry.playerId),
    key: position === 'DEF' ? `def:${team}` : `espn:${p.id ?? entry.playerId}`,
    name: p.fullName ?? 'Unknown player',
    position,
    team,
    eligible: (p.eligibleSlots ?? []).map(String),
    slot,
    projection: numeric(stat(1)?.appliedTotal),
    actual: numeric(stat(0)?.appliedTotal),
    partial: false,
    injury: p.injuryStatus ?? 'ACTIVE',
    ...info,
    locked,
    reserve: entry.lineupSlotId === 21,
    taxi: false,
  };
}
function fromESPN(
  raw: Raw,
  swid: string,
  proTeams: Raw[],
  week: number,
  season: number,
): League {
  const team = raw.teams?.find((t: Raw) =>
    (t.owners ?? []).some((o: string) => normalize(o) === normalize(swid)),
  );
  if (!team)
    throw new Error('Your ESPN account is not a member of this league.');
  const currentWeek = raw.status?.latestScoringPeriod ?? raw.scoringPeriodId,
    settings = raw.settings ?? {},
    slots = makeSlots(settings.rosterSettings?.lineupSlotCounts ?? {});
  const periodEntry = Object.entries(
    settings.scheduleSettings?.matchupPeriods ?? {},
  ).find(([, v]) => Array.isArray(v) && v.includes(week));
  const period = periodEntry ? Number(periodEntry[0]) : week;
  const match = raw.schedule?.find(
    (m: Raw) =>
      m.matchupPeriodId === period &&
      (m.home?.teamId === team.id || m.away?.teamId === team.id),
  );
  const mine = match?.home?.teamId === team.id ? match.home : match?.away,
    other = match?.home?.teamId === team.id ? match?.away : match?.home;
  const entries = team.roster?.entries ?? [];
  const used: Record<string, number> = {};
  const players = entries.map((e: Raw) => {
    const key = String(e.lineupSlotId);
    const index = used[key] ?? 0;
    used[key] = index + 1;
    const slot = slots.find((s) => s.id === `${key}:${index}`);
    return espnPlayer(e, proTeams, week, season, currentWeek, slot?.id ?? null);
  });
  const standings = (raw.teams ?? [])
    .map((t: Raw) => ({
      id: String(t.id),
      name: t.name ?? `${t.location ?? ''} ${t.nickname ?? ''}`.trim(),
      wins: t.record?.overall?.wins ?? 0,
      losses: t.record?.overall?.losses ?? 0,
      ties: t.record?.overall?.ties ?? 0,
      points: t.record?.overall?.pointsFor ?? 0,
      mine: t.id === team.id,
    }))
    .sort((a: Standing, b: Standing) => b.wins - a.wins || b.points - a.points);
  const rec = standings.find((t: Standing) => t.mine);
  const warning: string[] = [];
  if (week !== currentWeek)
    warning.push(
      'Roster reflects your current ESPN team, not a historical roster snapshot.',
    );
  if (
    !['INDIVIDUAL_GAME'].includes(settings.rosterSettings?.lineupLocktimeType)
  )
    warning.push(
      `League lock policy: ${settings.rosterSettings?.lineupLocktimeType ?? 'unknown'}. Verify lineup eligibility in ESPN.`,
    );
  if (settings.rosterSettings?.lineupLocktimeType !== 'INDIVIDUAL_GAME')
    players.forEach((p: Player) => {
      if (!p.locked) p.locked = null;
    });
  const recRule =
    settings.scoringSettings?.scoringItems?.find((s: Raw) => s.statId === 53)
      ?.points ?? 0;
  return {
    id: `espn:${raw.id}`,
    platform: 'espn',
    name: settings.name ?? 'ESPN league',
    teamName:
      team.name ?? `${team.location ?? ''} ${team.nickname ?? ''}`.trim(),
    url: `https://fantasy.espn.com/football/team?leagueId=${raw.id}&teamId=${team.id}&seasonId=${season}`,
    status: raw.draftDetail?.drafted ? 'in_season' : 'pre_draft',
    week,
    currentWeek,
    season,
    fetchedAt: new Date().toISOString(),
    scoring: `${recRule === 1 ? 'PPR' : recRule === 0.5 ? 'Half PPR' : recRule === 0 ? 'Standard' : `${recRule} PPR`} · ${raw.teams.length} teams`,
    source: 'ESPN · league-scored weekly projections',
    players,
    slots,
    standings,
    record: rec
      ? `${rec.wins}–${rec.losses}${rec.ties ? `–${rec.ties}` : ''}`
      : '—',
    actual:
      numeric(mine?.pointsByScoringPeriod?.[String(week)]) ??
      (week === currentWeek ? numeric(mine?.totalPointsLive) : null),
    matchupProjection:
      week === currentWeek ? numeric(mine?.totalProjectedPointsLive) : null,
    opponent: other
      ? {
          name:
            raw.teams.find((t: Raw) => t.id === other.teamId)?.name ??
            'Opponent',
          actual:
            numeric(other.pointsByScoringPeriod?.[String(week)]) ??
            (week === currentWeek ? numeric(other.totalPointsLive) : null),
          projection:
            week === currentWeek
              ? numeric(other.totalProjectedPointsLive)
              : null,
        }
      : null,
    warnings: warning,
  };
}

const sleeperEligible = (positions: string[], key: string) =>
  key === 'FLEX'
    ? positions.some((p) => ['RB', 'WR', 'TE'].includes(p))
    : key === 'SUPER_FLEX'
      ? positions.some((p) => ['QB', 'RB', 'WR', 'TE'].includes(p))
      : key === 'REC_FLEX'
        ? positions.some((p) => ['WR', 'TE'].includes(p))
        : key === 'WRRB_FLEX'
          ? positions.some((p) => ['WR', 'RB'].includes(p))
          : key === 'IDP_FLEX'
            ? positions.some((p) => ['DL', 'LB', 'DB'].includes(p))
            : positions.includes(key);
function fromSleeper(
  raw: Raw,
  rosters: Raw[],
  matches: Raw[],
  users: Raw[],
  details: Record<string, Raw>,
  projections: Raw[],
  proTeams: Raw[],
  week: number,
  season: number,
  currentWeek: number,
): League {
  const roster = rosters.find(
    (r) => r.owner_id === USER || (r.co_owners ?? []).includes(USER),
  );
  if (!roster)
    throw new Error('Sleeper roster membership could not be matched.');
  const me = matches.find((m) => m.roster_id === roster.roster_id),
    other = me?.matchup_id
      ? matches.find(
          (m) =>
            m.matchup_id === me.matchup_id && m.roster_id !== roster.roster_id,
        )
      : null;
  const label = (r: Raw | undefined) => {
    const u = users.find((u) => u.user_id === r?.owner_id);
    return (
      u?.metadata?.team_name ?? u?.display_name ?? `Team ${r?.roster_id ?? ''}`
    );
  };
  const slots = (raw.roster_positions ?? [])
    .filter((k: string) => !['BN', 'IR'].includes(k))
    .map((key: string, i: number) => ({
      id: `${key}:${i}`,
      key,
      label: key === 'SUPER_FLEX' ? 'SUPERFLEX' : key === 'DEF' ? 'D/ST' : key,
    }));
  const starterIds =
      (week === currentWeek ? me?.starters : undefined) ??
      roster.starters ??
      [],
    playerIds = roster.players ?? [];
  const players = playerIds
    .filter((id: string) => id && id !== '0')
    .map((id: string) => {
      const d = details[id] ?? {},
        projection = projections.find((p) => p.player_id === id),
        meta = d.full_name ? d : (projection?.player ?? d);
      const position = meta.position ?? (id.length <= 3 ? 'DEF' : '—'),
        team = abbreviation(meta.team ?? (position === 'DEF' ? id : 'FA')),
        info = gameInfo(team, proTeams, week);
      const index = starterIds.indexOf(id),
        eligible = (meta.fantasy_positions ?? [position]) as string[];
      const scoring = scoreSleeper(
        projection?.stats,
        raw.scoring_settings ?? {},
        position,
      );
      return {
        id,
        key:
          position === 'DEF'
            ? `def:${team}`
            : d.espn_id
              ? `espn:${d.espn_id}`
              : `sleeper:${id}`,
        name:
          meta.full_name ??
          (`${meta.first_name ?? ''} ${meta.last_name ?? ''}`.trim() ||
            `Player ${id}`),
        position,
        team,
        eligible: slots
          .filter((s: Slot) => sleeperEligible(eligible, s.key))
          .map((s: Slot) => s.key),
        slot: index >= 0 ? (slots[index]?.id ?? null) : null,
        ...scoring,
        actual: numeric(me?.players_points?.[id]),
        injury: meta.injury_status ?? 'ACTIVE',
        ...info,
        locked:
          info.kickoff !== null
            ? info.kickoff <= Date.now()
            : info.bye
              ? false
              : null,
        reserve: (roster.reserve ?? []).includes(id),
        taxi: (roster.taxi ?? []).includes(id),
      } as Player;
    });
  const standings = rosters
    .map((r) => ({
      id: String(r.roster_id),
      name: label(r),
      wins: r.settings?.wins ?? 0,
      losses: r.settings?.losses ?? 0,
      ties: r.settings?.ties ?? 0,
      points: (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100,
      mine: r.roster_id === roster.roster_id,
    }))
    .sort((a, b) => b.wins - a.wins || b.points - a.points);
  const record = standings.find((r) => r.mine)!;
  const reception = raw.scoring_settings?.rec ?? 0;
  const warnings = [];
  if (raw.settings?.max_subs) {
    const uncertain = players.some(
      (p: Player) =>
        !p.reserve && !p.taxi && (p.locked === true || p.locked === null),
    );
    warnings.push(
      uncertain
        ? 'AutoSubs can lock a later player when their partner starts. Pairings are not exposed; remaining slots are held until you verify them in Sleeper.'
        : 'AutoSubs enabled: verify paired-player assignments in Sleeper before kickoff.',
    );
    if (uncertain)
      players.forEach((p: Player) => {
        if (!p.locked) p.locked = null;
      });
  }
  if (!me)
    warnings.push(
      'No weekly matchup is available yet. Showing the current roster.',
    );
  warnings.push(
    'Sleeper projections are supplemental Rotowire estimates, recalculated with your scoring rules. Sparse standard stats count as projected zero; unsupported custom scoring is flagged.',
  );
  return {
    id: `sleeper:${raw.league_id}`,
    platform: 'sleeper',
    name: raw.name,
    teamName: label(roster),
    url: `https://sleeper.com/leagues/${raw.league_id}/team`,
    status: raw.status,
    season,
    week,
    currentWeek,
    fetchedAt: new Date().toISOString(),
    scoring: `${reception === 1 ? 'PPR' : reception === 0.5 ? 'Half PPR' : reception === 0 ? 'Standard' : `${reception} PPR`} · ${raw.total_rosters} teams`,
    source: 'Rotowire via Sleeper · custom scoring estimate',
    players,
    slots,
    standings,
    record: `${record.wins}–${record.losses}${record.ties ? `–${record.ties}` : ''}`,
    actual: numeric(me?.points),
    matchupProjection: null,
    opponent: other
      ? {
          name: label(rosters.find((r) => r.roster_id === other.roster_id)),
          actual: numeric(other.points),
          projection: null,
        }
      : null,
    warnings,
  };
}

export async function getDashboard(
  weekInput: number | undefined,
  refresh = false,
): Promise<Dashboard> {
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
  const allCache = await readCache(`dashboard:${season}:${week}`);
  if (
    allCache &&
    !degraded &&
    Date.now() - allCache.updated < (refresh ? 20000 : 180000)
  )
    return JSON.parse(allCache.value);
  const proData = await shared(`schedule:${season}`, 3600000, () =>
    json(`${ESPN}/${season}?view=proTeamSchedules_wl`),
  );
  const proTeams = proData.settings?.proTeams ?? [];
  const s2 = setting('ESPN_S2'),
    swid = setting('ESPN_SWID') ?? '',
    cookie = s2 && swid ? `espn_s2=${s2}; SWID=${swid}` : undefined;
  const raw = await Promise.allSettled(
    configured.map(async (t) =>
      t.platform === 'espn'
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
        (r: Raw) => r.owner_id === USER || (r.co_owners ?? []).includes(USER),
      );
      for (const id of roster?.players ?? []) if (id !== '0') ids.add(id);
    }
  });
  let details: Record<string, Raw> = {},
    projections: Raw[] = [];
  const sources = await Promise.allSettled([
    catalog(ids, refresh),
    json(
      `${SLEEPER}/projections/nfl/${season}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF`,
    ).then((rows: Raw[]) => rows.filter((p) => ids.has(p.player_id))),
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
        key = `league:${season}:${week}:${target.platform}:${target.id}`;
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
        await saveCache(key, league);
        return league;
      } catch (e) {
        const old = await readCache(key),
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
  await saveCache(`dashboard:${season}:${week}`, dashboard);
  return dashboard;
}
