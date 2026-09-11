/* Provider JSON is normalized here; no credentials or raw account data leave this boundary. */
/* oxlint-disable typescript/no-explicit-any */
import { loadWorkspace, readCache, saveCache } from '#dashboard-runtime';
import {
  cached,
  catalog,
  espnPlayer,
  fromESPN,
  fromSleeper,
  getDashboard,
  json,
} from './server';
import { applyForecast, historyWeeks, project } from './projections.ts';
import { loadDepthCharts } from './depth-server';
import { matchDepthPlayer, normalizeTeam } from './depth.ts';
import { roleForecast } from './roles.ts';
import type { DepthTeam } from './roles.ts';
import { ensureESPNStats, loadSleeperStatWeek } from './stat-ingestion.ts';
import { statStoreSummary } from './stat-store.ts';
import { scoreSleeper } from './scoring';
import type {
  GameSample,
  InsightReport,
  ProjectedPlayer,
} from './projections.ts';
type Raw = Record<string, any>;
const SLEEPER = 'https://api.sleeper.app';
const ESPN = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
const positionsQuery =
  'season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF';
const model = 'Sunday Desk · role-screened model v2';

import { scoreESPNGame } from './scoring.ts';

export async function getInsights(
  userId: string,
  leagueId: string,
  week: number,
  refresh = false,
): Promise<InsightReport> {
  const workspace = await loadWorkspace(userId);
  const connection = workspace.connections.find((c) =>
    c.leagues.some((l) => `${c.provider}:${l.id}` === leagueId),
  );
  const target = connection?.leagues.find(
    (l) => `${connection.provider}:${l.id}` === leagueId,
  );
  if (!connection || !target)
    throw new Error('League is not connected to this workspace.');
  const key = `insights-v3:${userId}:${workspace.revision}:${leagueId}:${target.season}:${week}`;
  const old = await readCache(key, userId);
  if (old && Date.now() - old.updated < (refresh ? 20000 : 180000))
    return JSON.parse(old.value);
  const dashboard = await getDashboard(userId, week, refresh);
  const initial = dashboard.leagues.find((l) => l.id === leagueId);
  if (!initial || initial.error || initial.stale)
    throw new Error('Refresh this league connection before loading insights.');
  const { season, currentWeek } = dashboard;
  const windows = historyWeeks(season, week, currentWeek);
  const proData = await cached(`schedule:${season}`, 3600000, () =>
    json(`${ESPN}/${season}?view=proTeamSchedules_wl`),
  );
  const proTeams = proData.settings?.proTeams ?? [];
  const depthPromise: Promise<Record<string, DepthTeam>> = loadDepthCharts(
    season,
    proTeams,
  ).catch(() => ({}));
  const warnings: string[] = [];
  let league = initial;
  let players: ProjectedPlayer[] = [],
    candidates: ProjectedPlayer[] = [],
    ownershipVerified = false;
  let evaluated = 0;
  if (connection.provider === 'espn') {
    const { s2, swid } = connection.credentials ?? {};
    if (!s2 || !swid)
      throw new Error('Reconnect ESPN to load league insights.');
    const cookie = `espn_s2=${s2}; SWID=${swid}`;
    const url = `${ESPN}/${season}/segments/0/leagues/${target.id}`;
    const raw = await json(
      `${url}?view=mSettings&view=mTeam&view=mRoster&view=mMatchupScore&view=mStandings&view=mDraftDetail&scoringPeriodId=${week}`,
      cookie,
    );
    league = fromESPN(raw, swid, proTeams, week, season);
    const espnWeek = league.currentWeek;
    const owned = new Set<string>();
    ownershipVerified =
      Array.isArray(raw.teams) &&
      raw.teams.length === raw.settings?.size &&
      raw.teams.every((t: Raw) => Array.isArray(t.roster?.entries));
    for (const team of raw.teams ?? [])
      for (const entry of team.roster?.entries ?? [])
        owned.add(String(entry.playerId ?? entry.playerPoolEntry?.player?.id));
    const [ownData, poolData] = await Promise.all([
      json(`${url}?view=kona_player_info&scoringPeriodId=${week}`, cookie, {
        players: {
          filterIds: { value: league.players.map((p) => Number(p.id)) },
        },
      }),
      json(
        `${url}?view=kona_player_info&scoringPeriodId=${raw.status?.transactionScoringPeriod ?? espnWeek}`,
        cookie,
        {
          players: {
            filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
            filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
            sortPercOwned: { sortPriority: 1, sortAsc: false },
            limit: 200,
            offset: 0,
          },
        },
      ),
    ]);
    if (!Array.isArray(ownData.players) || !Array.isArray(poolData.players))
      throw new Error('ESPN player history is temporarily unavailable.');
    const storedHistory = await ensureESPNStats(
      [
        ...league.players.map((p) => p.id),
        ...poolData.players.map((p: Raw) => String(p.id)),
      ],
      season,
    );
    const statsById = new Map<string, Raw[]>();
    for (const record of storedHistory) {
      const rows = statsById.get(record.player_id) ?? [];
      rows.push({
        seasonId: record.season,
        scoringPeriodId: record.week,
        statSourceId: 0,
        statSplitTypeId: 1,
        proTeamId:
          record.historical_team == null
            ? undefined
            : Number(record.historical_team),
        stats: record.native_stats,
      });
      statsById.set(record.player_id, rows);
    }
    const rules = raw.settings?.scoringSettings?.scoringItems ?? [];
    const depth = await depthPromise;
    const knownStats = new Set<string>();
    for (const rows of statsById.values())
      for (const s of rows)
        if (
          s.statSourceId === 0 &&
          s.statSplitTypeId === 1 &&
          s.stats?.['210'] > 0 &&
          (s.seasonId < season ||
            (s.seasonId === season &&
              s.scoringPeriodId < Math.min(week, espnWeek)))
        )
          Object.keys(s.stats).forEach((k) => knownStats.add(k));
    const forecast = (entry: Raw, player: import('./types').Player) => {
      const native = entry.player;
      const samples: GameSample[] = (statsById.get(String(native.id)) ?? [])
        .filter(
          (s: Raw) =>
            s.statSourceId === 0 && s.statSplitTypeId === 1 && s.stats,
        )
        .map((s: Raw) => {
          const score = scoreESPNGame(
            s.stats,
            rules,
            native.defaultPositionId,
            knownStats,
          );
          return {
            season: s.seasonId,
            week: s.scoringPeriodId,
            points: score.projection ?? 0,
            partial: score.partial,
            receptions: s.stats['53'] ?? 0,
            played: Number(s.stats['210']) > 0,
            team: normalizeTeam(
              proTeams.find((t: Raw) => t.id === s.proTeamId)?.abbrev ??
                'UNKNOWN',
            ),
            passAttempts: s.stats['210'] > 0 ? (s.stats['0'] ?? 0) : undefined,
            carries: s.stats['210'] > 0 ? (s.stats['23'] ?? 0) : undefined,
            targets: s.stats['210'] > 0 ? (s.stats['58'] ?? 0) : undefined,
          };
        });
      const reception = rules.find((r: Raw) => r.statId === 53);
      return roleForecast(
        player,
        samples,
        depth[player.team],
        String(native.id),
        season,
        week,
        espnWeek,
        reception?.pointsOverrides?.[native.defaultPositionId] ??
          reception?.points ??
          0,
      );
    };
    players = league.players.map((p) => {
      const entry = ownData.players.find((e: Raw) => String(e.id) === p.id);
      const result = entry
        ? forecast(entry, p)
        : roleForecast(p, [], depth[p.team], p.id, season, week, espnWeek);
      return applyForecast(p, result.forecast, result.role);
    });
    candidates = poolData.players
      .filter(
        (e: Raw) =>
          Number(e.onTeamId) === 0 &&
          ['FREEAGENT', 'WAIVERS'].includes(e.status) &&
          !owned.has(String(e.id)) &&
          e.player?.proTeamId,
      )
      .map((e: Raw) => {
        const p = espnPlayer(
          { playerPoolEntry: e },
          proTeams,
          week,
          season,
          espnWeek,
          null,
        );
        if (e.rosterLocked === true) p.locked = true;
        if (
          raw.settings?.rosterSettings?.lineupLocktimeType !==
            'INDIVIDUAL_GAME' &&
          !p.locked
        )
          p.locked = null;
        const result = forecast(e, p);
        return {
          ...applyForecast(p, result.forecast, result.role),
          availability: e.status === 'WAIVERS' ? 'On waivers' : 'Free agent',
          waiverDate: Number.isFinite(e.waiverProcessDate)
            ? e.waiverProcessDate
            : null,
        };
      });
    evaluated = candidates.length;
    warnings.push(
      'Scanned up to 200 available offensive players, kickers and defenses, ordered by ESPN ownership. This is a shortlist, not the entire player pool.',
    );
  } else {
    const [raw, rosters, matches, users, projectionRows, history] =
      await Promise.all([
        json(`${SLEEPER}/v1/league/${target.id}`),
        json(`${SLEEPER}/v1/league/${target.id}/rosters`),
        json(`${SLEEPER}/v1/league/${target.id}/matchups/${week}`),
        json(`${SLEEPER}/v1/league/${target.id}/users`),
        json(
          `${SLEEPER}/projections/nfl/${season}/${week}?${positionsQuery}`,
        ).catch(() => []),
        Promise.all(windows.map((w) => loadSleeperStatWeek(w.season, w.week))),
      ]);
    if (!history.every(Array.isArray))
      throw new Error('Historical stats are temporarily unavailable.');
    ownershipVerified =
      Array.isArray(rosters) &&
      rosters.length === raw.total_rosters &&
      rosters.every((r: Raw) => Array.isArray(r.players));
    const owned = new Set<string>(
      rosters.flatMap((r: Raw) => [
        ...(r.players ?? []),
        ...(r.reserve ?? []),
        ...(r.taxi ?? []),
      ]),
    );
    const statsByPlayer = new Map<string, Raw[]>(),
      knownStats = new Set<string>();
    for (const rows of history)
      for (const row of rows) {
        if (
          !['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(
            row.player?.position,
          ) ||
          !(row.stats?.gp > 0 || row.stats?.gms_active > 0)
        )
          continue;
        Object.keys(row.stats).forEach((k) => knownStats.add(k));
        const list = statsByPlayer.get(row.player_id) ?? [];
        list.push(row);
        statsByPlayer.set(row.player_id, list);
      }
    const samplesFor = (rows: Raw[], position: string): GameSample[] =>
      rows.map((r) => {
        // Actual stat feeds are sparse. Zero-fill only keys evidenced in this historical feed.
        const stats = { ...r.stats };
        for (const k of Object.keys(raw.scoring_settings ?? {}))
          if (knownStats.has(k)) stats[k] ??= 0;
        const value = scoreSleeper(stats, raw.scoring_settings ?? {}, position);
        return {
          season: Number(r.season),
          week: Number(r.week),
          points: value.projection ?? 0,
          partial:
            value.partial || !Object.keys(raw.scoring_settings ?? {}).length,
          receptions: r.stats.rec ?? 0,
          team: normalizeTeam(r.team ?? 'UNKNOWN'),
          played: r.stats.gp > 0,
          activeWithoutAppearance: r.stats.gms_active > 0 && !(r.stats.gp > 0),
          passAttempts: r.stats.gp > 0 ? (r.stats.pass_att ?? 0) : undefined,
          carries: r.stats.gp > 0 ? (r.stats.rush_att ?? 0) : undefined,
          targets: r.stats.gp > 0 ? (r.stats.rec_tgt ?? 0) : undefined,
          snaps: r.stats.off_snp,
          teamSnaps: r.stats.tm_off_snp,
        };
      });
    const receptionWeight = (position: string) =>
      (raw.scoring_settings?.rec ?? 0) +
      (raw.scoring_settings?.[`bonus_rec_${position.toLowerCase()}`] ?? 0);
    const score = (rows: Raw[], position: string) =>
      project(
        samplesFor(rows, position),
        season,
        week,
        currentWeek,
        receptionWeight(position),
      );
    // Shortlist by our model within each position, plus provider leaders to surface rookies with no history.
    const shortlist = new Set<string>();
    for (const position of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
      const scored = [...statsByPlayer]
        .filter(
          ([id, rows]) =>
            !owned.has(id) && rows[0].player.position === position,
        )
        .map(([id, rows]) => ({ id, value: score(rows, position).points }))
        .sort((a, b) => (b.value ?? -999) - (a.value ?? -999));
      scored.slice(0, 30).forEach((p) => shortlist.add(p.id));
      (projectionRows as Raw[])
        .filter(
          (p) => p.player?.position === position && !owned.has(p.player_id),
        )
        .sort((a, b) => (b.stats?.pts_ppr ?? 0) - (a.stats?.pts_ppr ?? 0))
        .slice(0, 10)
        .forEach((p) => shortlist.add(p.player_id));
    }
    const myRoster = rosters.find(
      (r: Raw) =>
        r.owner_id === connection.accountId ||
        (r.co_owners ?? []).includes(connection.accountId),
    );
    if (!myRoster)
      throw new Error('Your roster membership could not be verified.');
    const ids = new Set<string>([...shortlist, ...(myRoster.players ?? [])]);
    const details = await catalog(
      ids,
      refresh,
      `insight-catalog:${userId}:${workspace.revision}`,
      userId,
    );
    league = fromSleeper(
      raw,
      rosters,
      matches,
      users,
      details,
      projectionRows,
      proTeams,
      week,
      season,
      currentWeek,
      connection.accountId,
    );
    const depth = await depthPromise;
    const scoredRole = (p: import('./types').Player) => {
      const team = depth[p.team],
        athleteId = matchDepthPlayer(
          team,
          details[p.id]?.espn_id ? String(details[p.id].espn_id) : undefined,
          p.name,
          p.position,
        );
      const result = roleForecast(
        p,
        samplesFor(statsByPlayer.get(p.id) ?? [], p.position),
        team,
        athleteId,
        season,
        week,
        currentWeek,
        receptionWeight(p.position),
      );
      return applyForecast(p, result.forecast, result.role);
    };
    players = league.players.map(scoredRole);
    // Reuse the exact provider normalization for eligibility, schedules, injury labels and AutoSubs gates.
    const candidateRoster = {
      ...myRoster,
      players: [...shortlist],
      starters: [],
      reserve: [],
      taxi: [],
    };
    const candidateLeague = fromSleeper(
      { ...raw, settings: { ...raw.settings, max_subs: 0 } },
      [candidateRoster],
      [],
      users,
      details,
      projectionRows,
      proTeams,
      week,
      season,
      currentWeek,
      connection.accountId,
    );
    if (
      raw.settings?.max_subs &&
      league.players.some((p) => !p.reserve && !p.taxi && p.locked !== false)
    )
      candidateLeague.players.forEach((p) => {
        if (!p.locked) p.locked = null;
      });
    candidates = candidateLeague.players
      .filter(
        (p) =>
          !owned.has(p.id) &&
          !!details[p.id]?.team &&
          !!details[p.id]?.position,
      )
      .map((p) => ({
        ...scoredRole(p),
        availability: 'Unrostered · check waiver rules',
      }));
    evaluated = candidates.length;
    warnings.push(
      'Scanned up to 30 historical leaders and 10 provider leaders per position. Sleeper confirms unrostered status; claim timing and pending claims must be checked in the league.',
    );
  }
  if (!ownershipVerified) {
    candidates = [];
    warnings.push(
      'Complete league ownership could not be verified. Waiver suggestions are paused.',
    );
  }
  if (week !== currentWeek)
    warnings.push(
      'Past and future weeks are for research. Waiver and lineup actions are paused.',
    );
  warnings.push(
    'Current NFL depth charts and roster availability screen the historical model. Same-team workload samples must fit the current role. Depth is not a guaranteed snap share; unknown or changing roles are withheld. Matchup strength, weather and injury recovery are not modeled.',
  );
  const through = historyWeeks(season, week, league.currentWeek)[0];
  const report: InsightReport = {
    league: { ...league, players, source: model },
    candidates,
    historyThrough: `${through.season} · week ${through.week}`,
    fetchedAt: new Date().toISOString(),
    evaluated,
    warnings,
    model,
    ownershipVerified,
    database: await statStoreSummary(),
  };
  await saveCache(key, report, userId);
  return report;
}
