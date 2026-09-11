/* Provider JSON is normalized here; no credentials or raw account data leave this boundary. */
/* oxlint-disable typescript/no-explicit-any */
import { loadWorkspace, readCache, saveCache } from '#dashboard-runtime';
import {
  cached,
  addGameStatuses,
  catalog,
  espnPlayer,
  fromESPN,
  fromSleeper,
  getDashboard,
  json,
} from './server';
import { scoreSleeper } from './scoring';
import { selectSleeperProjections } from './providers';
import type { InsightReport, AvailablePlayer } from './projections.ts';
type Raw = Record<string, any>;
const SLEEPER = 'https://api.sleeper.app';
const ESPN = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
const positionsQuery =
  'season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF';
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
  const key = `insights-lineup-v6:${userId}:${workspace.revision}:${leagueId}:${target.season}:${week}`;
  const old = await readCache(key, userId);
  if (old && Date.now() - old.updated < (refresh ? 20000 : 180000))
    return JSON.parse(old.value);
  const dashboard = await getDashboard(userId, week, refresh);
  const initial = dashboard.leagues.find((l) => l.id === leagueId);
  if (!initial || initial.error || initial.stale)
    throw new Error('Refresh this league connection before loading insights.');
  const { season, currentWeek } = dashboard;
  const proData = await cached(`schedule:${season}`, 3600000, () =>
    json(`${ESPN}/${season}?view=proTeamSchedules_wl`),
  );
  const proTeams = await addGameStatuses(
    proData.settings?.proTeams ?? [],
    season,
    week,
  );
  const warnings: string[] = [];
  let league = initial;
  let candidates: AvailablePlayer[] = [],
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
    const poolData = await json(
      `${url}?view=kona_player_info&scoringPeriodId=${week}`,
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
    );
    if (!Array.isArray(poolData.players))
      throw new Error(
        'ESPN available-player projections are temporarily unavailable.',
      );
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
        return {
          ...p,
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
    const [raw, rosters, matches, users, projectionRows] = await Promise.all([
      json(`${SLEEPER}/v1/league/${target.id}`),
      json(`${SLEEPER}/v1/league/${target.id}/rosters`),
      json(`${SLEEPER}/v1/league/${target.id}/matchups/${week}`),
      json(`${SLEEPER}/v1/league/${target.id}/users`),
      json(`${SLEEPER}/projections/nfl/${season}/${week}?${positionsQuery}`),
    ]);
    if (!Array.isArray(projectionRows))
      throw new Error('Sleeper projections are temporarily unavailable.');
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
    // Rank provider-projected statistics using this league's scoring, never historical estimates.
    const shortlist = new Set<string>();
    for (const position of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
      selectSleeperProjections(projectionRows, season, week)
        .filter(
          (p: Raw) =>
            p.player?.position === position && !owned.has(p.player_id),
        )
        .map((p: Raw) => ({
          id: String(p.player_id),
          ...scoreSleeper(p.stats, raw.scoring_settings ?? {}, week),
        }))
        .filter(
          (p: { projection: number | null; partial: boolean }) =>
            !p.partial &&
            p.projection !== null &&
            Number.isFinite(p.projection),
        )
        .sort((a, b) => b.projection! - a.projection!)
        .slice(0, 40)
        .forEach((p: { id: string }) => shortlist.add(p.id));
    }
    const myRoster = rosters.find(
      (r: Raw) =>
        r.owner_id === connection.accountId ||
        (r.co_owners ?? []).includes(connection.accountId),
    );
    if (!myRoster)
      throw new Error('Your roster membership could not be verified.');
    const myMatch = matches.find(
      (m: Raw) => m.roster_id === myRoster.roster_id,
    );
    const opponentMatches =
      myMatch?.matchup_id != null
        ? matches.filter(
            (m: Raw) =>
              m.matchup_id === myMatch.matchup_id &&
              m.roster_id !== myRoster.roster_id,
          )
        : [];
    const opponentStarters =
      opponentMatches.length === 1 ? (opponentMatches[0].starters ?? []) : [];
    const ids = new Set<string>(
      [
        ...shortlist,
        ...(myRoster.players ?? []),
        ...(myMatch?.starters ?? []),
        ...opponentStarters,
      ].filter((id) => id && id !== '0'),
    );
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
    // Reuse the exact provider normalization for eligibility, schedules and injury labels.
    const candidateRoster = {
      ...myRoster,
      players: [...shortlist],
      starters: [],
      reserve: [],
      taxi: [],
    };
    const candidateLeague = fromSleeper(
      raw,
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
    candidates = candidateLeague.players
      .filter(
        (p) =>
          !owned.has(p.id) &&
          !!details[p.id]?.team &&
          !!details[p.id]?.position,
      )
      .map((p) => ({
        ...p,
        availability: 'Unrostered · check waiver rules',
      }));
    evaluated = candidates.length;
    warnings.push(
      'Scanned up to 40 leaders per position using Sleeper projections and your league scoring. Sleeper confirms unrostered status; claim timing and pending claims must be checked in the league.',
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
  const report: InsightReport = {
    projectionSource: 'provider',
    league,
    candidates,
    fetchedAt: new Date().toISOString(),
    evaluated,
    warnings,
    ownershipVerified,
  };
  await saveCache(key, report, userId);
  return report;
}
