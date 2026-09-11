/* Provider payloads are normalized here; account owners and credentials never leave this boundary. */
/* oxlint-disable typescript/no-explicit-any */
import { scoreSleeper } from './scoring.ts';
import type { GameStatus } from './points.ts';
import type { League, Player, Slot, Standing } from './types.ts';
type Raw = Record<string, any>;
const numeric = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? n : null;
const normalize = (v: unknown) =>
  (typeof v === 'string' ? v : '').replace(/[{}]/g, '').toLowerCase();
const abbreviation = (v: string) =>
  ({ WSH: 'WAS', JAC: 'JAX', LA: 'LAR' })[v] ?? v;
export function selectSleeperProjections(
  rows: Raw[],
  season: number,
  week: number,
): Raw[] {
  const selected = new Map<string, Raw>();
  for (const row of rows) {
    if (
      typeof row.player_id !== 'string' ||
      !row.player_id ||
      Number(row.season) !== season ||
      Number(row.week) !== week ||
      row.season_type !== 'regular' ||
      row.category !== 'proj' ||
      row.company !== 'rotowire' ||
      !row.stats ||
      typeof row.stats !== 'object' ||
      Array.isArray(row.stats)
    )
      continue;
    const prior = selected.get(row.player_id);
    const updated = (r: Raw) =>
      typeof r.updated_at === 'number'
        ? r.updated_at
        : Date.parse(r.updated_at) || 0;
    if (!prior || updated(row) > updated(prior))
      selected.set(row.player_id, row);
  }
  return [...selected.values()];
}
export function gameInfo(team: string, proTeams: Raw[], week: number) {
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
    gameStatus: (pro?.byeWeek === week
      ? 'bye'
      : (game?.gameStatus ?? 'unknown')) as GameStatus,
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
  '9': 'DT',
  '10': 'DE',
  '11': 'LB',
  '12': 'CB',
  '13': 'S',
  '17': 'EDR',
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
export function espnPlayer(
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
export function fromESPN(
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
  const matching = (raw.schedule ?? []).filter(
    (m: Raw) =>
      m.matchupPeriodId === period &&
      (m.home?.teamId === team.id || m.away?.teamId === team.id),
  );
  const match = matching.length === 1 ? matching[0] : undefined;
  const mine = match?.home?.teamId === team.id ? match.home : match?.away,
    other = match?.home?.teamId === team.id ? match?.away : match?.home;
  const normalizeRoster = (entries: Raw[]): Player[] => {
    const used: Record<string, number> = {};
    return entries.map((e: Raw) => {
      const key = String(e.lineupSlotId);
      const index = used[key] ?? 0;
      used[key] = index + 1;
      const slot = slots.find((s) => s.id === `${key}:${index}`);
      return espnPlayer(
        e,
        proTeams,
        week,
        season,
        currentWeek,
        slot?.id ?? null,
      );
    });
  };
  const players = normalizeRoster(team.roster?.entries ?? []);
  const opponentTeam = (raw.teams ?? []).find(
    (t: Raw) => t.id === other?.teamId && t.id !== team.id,
  );
  const rosterValid = (entries: unknown): boolean => {
    if (!Array.isArray(entries)) return false;
    const ids = new Set<string>();
    const counts: Record<string, number> = {};
    return entries.every((entry: Raw) => {
      const id = String(
        entry.playerId ?? entry.playerPoolEntry?.player?.id ?? '',
      );
      if (!/^-?\d+$/.test(id) || ids.has(id)) return false;
      ids.add(id);
      const key = String(entry.lineupSlotId);
      if (['20', '21', '24'].includes(key)) return true;
      counts[key] = (counts[key] ?? 0) + 1;
      return (
        counts[key] <= slots.filter((s) => s.key === key).length &&
        (entry.playerPoolEntry?.player?.eligibleSlots ?? [])
          .map(String)
          .includes(key)
      );
    });
  };
  const opponentPlayers = normalizeRoster(
    opponentTeam?.roster?.entries ?? [],
  ).filter((p) => p.slot !== null);
  const periodWeeks = periodEntry ? (periodEntry[1] as number[]) : [week];
  const singleWeek = periodWeeks.length === 1;
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
  const ownRosterVerified = rosterValid(team.roster?.entries);
  if (!ownRosterVerified)
    warning.push(
      'Starting assignments could not be verified. Refresh this league before making lineup changes.',
    );
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
    [...players, ...opponentPlayers].forEach((p: Player) => {
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
    stale: !ownRosterVerified,
    players,
    slots,
    standings,
    record: rec
      ? `${rec.wins}–${rec.losses}${rec.ties ? `–${rec.ties}` : ''}`
      : '—',
    actual:
      numeric(mine?.pointsByScoringPeriod?.[String(week)]) ??
      (week === currentWeek && singleWeek
        ? numeric(mine?.totalPointsLive)
        : null),
    matchupProjection:
      week === currentWeek && singleWeek
        ? numeric(mine?.totalProjectedPointsLive)
        : null,
    opponent:
      other && opponentTeam
        ? {
            id: String(other.teamId),
            players: opponentPlayers,
            rosterVerified:
              week === currentWeek && rosterValid(opponentTeam.roster?.entries),
            name:
              raw.teams.find((t: Raw) => t.id === other.teamId)?.name ??
              'Opponent',
            actual:
              numeric(other.pointsByScoringPeriod?.[String(week)]) ??
              (week === currentWeek && singleWeek
                ? numeric(other.totalPointsLive)
                : null),
            projection:
              week === currentWeek && singleWeek
                ? numeric(other.totalProjectedPointsLive)
                : null,
          }
        : null,
    warnings: warning,
  };
}

export const sleeperEligible = (positions: string[], key: string) =>
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
export function fromSleeper(
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
  sleeperUserId: string,
): League {
  const weeklyProjections = new Map(
    selectSleeperProjections(projections, season, week).map((p) => [
      p.player_id,
      p,
    ]),
  );
  const roster = rosters.find(
    (r) =>
      r.owner_id === sleeperUserId ||
      (r.co_owners ?? []).includes(sleeperUserId),
  );
  if (!roster)
    throw new Error('Sleeper roster membership could not be matched.');
  const me = matches.find((m) => m.roster_id === roster.roster_id);
  const peers =
    me?.matchup_id != null
      ? matches.filter(
          (m) =>
            m.matchup_id === me.matchup_id && m.roster_id !== roster.roster_id,
        )
      : [];
  const other = peers.length === 1 ? peers[0] : null;
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
  const normalizeRoster = (roster: Raw, me: Raw | undefined): Player[] => {
    const starterIds =
        (week === currentWeek ? me?.starters : undefined) ??
        roster.starters ??
        [],
      playerIds = [
        ...new Set<string>([...(roster.players ?? []), ...starterIds]),
      ];
    const players = playerIds
      .filter((id: string) => id && id !== '0')
      .map((id: string) => {
        const d = details[id] ?? {},
          projection = weeklyProjections.get(id),
          meta = d.full_name ? d : (projection?.player ?? d);
        const position = meta.position ?? (id.length <= 3 ? 'DEF' : '—'),
          team = abbreviation(meta.team ?? (position === 'DEF' ? id : 'FA')),
          info = gameInfo(team, proTeams, week);
        const index = starterIds.indexOf(id),
          eligible = (meta.fantasy_positions ?? [position]) as string[];
        const scoring = scoreSleeper(
          projection?.stats,
          raw.scoring_settings ?? {},
          week,
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
    return players;
  };
  const players = normalizeRoster(roster, me);
  const startersValid = (values: unknown): boolean => {
    if (!Array.isArray(values) || values.length !== slots.length) return false;
    const ids = values.filter((id) => id !== '0');
    return (
      ids.every((id) => typeof id === 'string' && id.length > 0) &&
      new Set(ids).size === ids.length
    );
  };
  const ownRosterVerified = startersValid(
    (week === currentWeek ? me?.starters : undefined) ?? roster.starters,
  );
  const otherRoster = rosters.find((r) => r.roster_id === other?.roster_id);
  const opponentPlayers =
    other && otherRoster
      ? normalizeRoster(
          {
            ...otherRoster,
            players: other.starters ?? [],
            starters: other.starters ?? [],
          },
          other,
        ).filter((p) => p.slot !== null)
      : [];
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
  if (!me)
    warnings.push(
      'No weekly matchup is available yet. Showing the current roster.',
    );
  warnings.push(
    'Sleeper’s Rotowire projections use the scoring rules from its app for this league. Missing estimates stay unavailable; unsupported scoring is flagged.',
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
    source: 'Sleeper / Rotowire · league-scored projections',
    stale: !ownRosterVerified,
    players,
    slots,
    standings,
    record: `${record.wins}–${record.losses}${record.ties ? `–${record.ties}` : ''}`,
    actual: numeric(me?.custom_points) ?? numeric(me?.points),
    matchupProjection: null,
    opponent: other
      ? {
          id: String(other.roster_id),
          players: opponentPlayers,
          rosterVerified:
            week === currentWeek &&
            !!otherRoster &&
            startersValid(other.starters),
          name: label(rosters.find((r) => r.roster_id === other.roster_id)),
          actual: numeric(other.custom_points) ?? numeric(other.points),
          projection: null,
        }
      : null,
    warnings,
  };
}
