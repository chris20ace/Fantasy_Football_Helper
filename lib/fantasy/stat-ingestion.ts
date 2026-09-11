import {
  writeStatBatch,
  readStatCoverage,
  readPlayerStats,
  readWeekStats,
  saveGames,
} from './stat-store.ts';
import type { StatRecord, GameRecord } from './stat-store.ts';
const ESPN = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
const positions: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  9: 'DT',
  10: 'DE',
  11: 'LB',
  12: 'CB',
  13: 'S',
  15: 'TQB',
  16: 'DEF',
  17: 'EDR',
};
type ESPNPlayer = {
  id: number;
  fullName: string;
  defaultPositionId: number;
  stats?: {
    seasonId: number;
    scoringPeriodId: number;
    statSourceId: number;
    statSplitTypeId: number;
    proTeamId?: number;
    externalId?: string;
    stats: Record<string, number>;
  }[];
};
export async function publicStatJSON(url: string, filter?: unknown) {
  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(filter ? { 'X-Fantasy-Filter': JSON.stringify(filter) } : {}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok)
    throw new Error(`Public football stats unavailable (${r.status}).`);
  return r.json();
}
export function normalizeESPNStats(
  players: ESPNPlayer[],
  source: string,
): StatRecord[] {
  const rows = new Map<string, StatRecord>();
  for (const p of players)
    for (const s of p.stats ?? []) {
      if (
        s.statSourceId !== 0 ||
        s.statSplitTypeId !== 1 ||
        !Number.isInteger(s.scoringPeriodId) ||
        s.scoringPeriodId < 1 ||
        s.scoringPeriodId > 18 ||
        !s.stats
      )
        continue;
      const record: StatRecord = {
        provider: 'espn',
        player_id: String(p.id),
        season: s.seasonId,
        week: s.scoringPeriodId,
        event_id: s.externalId ?? null,
        historical_team: s.proTeamId == null ? null : String(s.proTeamId),
        player_name: p.fullName,
        position: positions[p.defaultPositionId] ?? 'OTHER',
        played: s.stats['210'] == null ? null : s.stats['210'] > 0,
        native_stats: Object.fromEntries(
          Object.entries(s.stats).filter(
            ([, v]) => typeof v === 'number' && Number.isFinite(v),
          ),
        ),
        source_url: source,
      };
      rows.set(`${record.player_id}:${record.season}:${record.week}`, record);
    }
  return [...rows.values()];
}
export async function ensureESPNStats(
  ids: string[],
  season: number,
  force = false,
) {
  await Promise.all([ensureNFLGames(season - 1), ensureNFLGames(season)]);
  const unique = [...new Set(ids)];
  const fresh = force
    ? new Set<string>()
    : await readStatCoverage(
        'espn',
        season,
        unique.map((id) => 'player:' + id),
        3600000,
      );
  const missing = unique.filter((id) => !fresh.has('player:' + id));
  for (let start = 0; start < missing.length; start += 100) {
    const batch = missing.slice(start, start + 100),
      source = `${ESPN}/${season}/players?view=kona_player_info`;
    const players = (await publicStatJSON(source, {
      filterIds: { value: batch.map(Number) },
      filterStatsForTopScoringPeriodIds: {
        value: 36,
        additionalValue: [`00${season - 1}`, `00${season}`],
      },
    })) as ESPNPlayer[];
    if (
      !Array.isArray(players) ||
      !players.every((p) => batch.includes(String(p.id)))
    )
      throw new Error('Invalid ESPN statistics batch.');
    const records = normalizeESPNStats(players, source);
    // Only confirmed returned IDs are marked covered; a missing player response is never mistaken for zero stats.
    await writeStatBatch(
      records,
      players.map((p) => ({
        provider: 'espn',
        season,
        resource: 'player:' + p.id,
        row_count: records.filter((r) => r.player_id === String(p.id)).length,
      })),
    );
  }
  return readPlayerStats('espn', season, unique);
}
type ScoreboardEvent = {
  id: string;
  season: { year: number; type: number };
  week: { number: number };
  date: string;
  status: { type: { completed: boolean } };
  competitions: {
    competitors: {
      id: string;
      homeAway: string;
      score?: string;
      team: { abbreviation: string };
    }[];
  }[];
};
const gameImports = new Map<number, Promise<void>>();
export async function ensureNFLGames(season: number) {
  const running = gameImports.get(season);
  if (running) return running;
  const task = importNFLGames(season).finally(() => gameImports.delete(season));
  gameImports.set(season, task);
  return task;
}
async function importNFLGames(season: number) {
  if ((await readStatCoverage('espn', season, ['games'], 3600000)).has('games'))
    return;
  const source = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}0801-${season + 1}0228&limit=1000`;
  const raw = (await publicStatJSON(source)) as { events: ScoreboardEvent[] };
  if (!Array.isArray(raw.events))
    throw new Error('NFL schedule data is unavailable.');
  const games: GameRecord[] = raw.events
    .filter((e) => e.season?.year === season && e.season?.type === 2)
    .map((e) => {
      const teams = e.competitions?.[0]?.competitors ?? [],
        home = teams.find((t) => t.homeAway === 'home'),
        away = teams.find((t) => t.homeAway === 'away');
      if (
        !home ||
        !away ||
        !Number.isFinite(Date.parse(e.date)) ||
        !Number.isInteger(e.week?.number)
      )
        throw new Error('Incomplete NFL game record.');
      return {
        event_id: e.id,
        season,
        week: e.week.number,
        kickoff: e.date,
        completed: e.status.type.completed === true,
        home_team_id: home.id,
        away_team_id: away.id,
        home_team: home.team.abbreviation,
        away_team: away.team.abbreviation,
        home_score:
          home.score != null && Number.isFinite(Number(home.score))
            ? Number(home.score)
            : null,
        away_score:
          away.score != null && Number.isFinite(Number(away.score))
            ? Number(away.score)
            : null,
        source_url: source,
      };
    });
  const expectedWeeks = season >= 2021 ? 18 : 17;
  if (
    !games.length ||
    new Set(games.map((g) => g.event_id)).size !== games.length ||
    new Set(games.map((g) => g.week)).size !== expectedWeeks ||
    (season >= 2021 && games.length !== 272) ||
    games.some((g) => g.week < 1 || g.week > expectedWeeks)
  )
    throw new Error('NFL regular-season schedule is incomplete.');
  await saveGames(games, season);
}
type SleeperRow = {
  player_id: string;
  season: string | number;
  week: number;
  team?: string;
  player?: { position?: string; first_name?: string; last_name?: string };
  stats: Record<string, number>;
};
export async function loadSleeperStatWeek(season: number, week: number) {
  await ensureNFLGames(season);
  const resource = 'week:' + week;
  if (
    !(await readStatCoverage('sleeper', season, [resource], 21600000)).has(
      resource,
    )
  ) {
    const source = `https://api.sleeper.app/stats/nfl/${season}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF`;
    const rows = (await publicStatJSON(source)) as SleeperRow[];
    if (
      !Array.isArray(rows) ||
      !rows.length ||
      rows.some((r) => Number(r.season) !== season || Number(r.week) !== week)
    )
      throw new Error('Invalid historical statistics week.');
    const records = rows.map(
      (r): StatRecord => ({
        provider: 'sleeper',
        player_id: r.player_id,
        season,
        week,
        event_id: null,
        historical_team: r.team ?? null,
        player_name: [r.player?.first_name, r.player?.last_name]
          .filter(Boolean)
          .join(' '),
        position: r.player?.position ?? 'UNKNOWN',
        played: r.stats.gp == null ? null : r.stats.gp > 0,
        native_stats: Object.fromEntries(
          Object.entries(r.stats).filter(
            ([, v]) => typeof v === 'number' && Number.isFinite(v),
          ),
        ),
        source_url: source,
      }),
    );
    await writeStatBatch(records, [
      { provider: 'sleeper', season, resource, row_count: records.length },
    ]);
  }
  const records = await readWeekStats('sleeper', season, week);
  return records.map((r) => ({
    player_id: r.player_id,
    season: r.season,
    week: r.week,
    team: r.historical_team,
    player: { position: r.position },
    stats: r.native_stats,
  }));
}
