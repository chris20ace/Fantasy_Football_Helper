import { getPool } from '../accounts/db.ts';
export type StatRecord = {
  provider: 'espn' | 'sleeper';
  player_id: string;
  season: number;
  week: number;
  event_id: string | null;
  historical_team: string | null;
  player_name: string;
  position: string;
  played: boolean | null;
  native_stats: Record<string, number>;
  source_url: string;
};
export type GameRecord = {
  event_id: string;
  season: number;
  week: number;
  kickoff: string;
  completed: boolean;
  home_team_id: string;
  away_team_id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  source_url: string;
};
export async function saveGames(games: GameRecord[], season: number) {
  const connection = await getPool().connect();
  try {
    await connection.query('begin');
    await connection.query(
      `insert into sunday_desk.nfl_game(event_id,season,week,kickoff,completed,home_team_id,away_team_id,home_team,away_team,home_score,away_score,source_url)
      select event_id,season,week,kickoff,completed,home_team_id,away_team_id,home_team,away_team,home_score,away_score,source_url
      from jsonb_to_recordset($1::jsonb) as x(event_id text,season int,week int,kickoff timestamptz,completed boolean,home_team_id text,away_team_id text,home_team text,away_team text,home_score numeric,away_score numeric,source_url text)
      on conflict(event_id) do update set season=excluded.season,week=excluded.week,kickoff=excluded.kickoff,completed=excluded.completed,home_team_id=excluded.home_team_id,away_team_id=excluded.away_team_id,home_team=excluded.home_team,away_team=excluded.away_team,home_score=excluded.home_score,away_score=excluded.away_score,source_url=excluded.source_url,fetched_at=now()`,
      [JSON.stringify(games)],
    );
    await connection.query(
      `insert into sunday_desk.nfl_stat_coverage(provider,season,resource,row_count) values('espn',$1,'games',$2) on conflict(provider,season,resource) do update set row_count=excluded.row_count,synced_at=now()`,
      [season, games.length],
    );
    await connection.query('commit');
  } catch (e) {
    await connection.query('rollback');
    throw e;
  } finally {
    connection.release();
  }
}
export async function writeStatBatch(
  records: StatRecord[],
  coverage: {
    provider: 'espn' | 'sleeper';
    season: number;
    resource: string;
    row_count: number;
  }[],
) {
  const connection = await getPool().connect();
  try {
    await connection.query('begin');
    if (records.length)
      await connection.query(
        `insert into sunday_desk.nfl_player_week
      (provider,player_id,season,week,event_id,historical_team,player_name,position,played,native_stats,source_url)
      select provider,player_id,season,week,event_id,historical_team,player_name,position,played,native_stats,source_url
      from jsonb_to_recordset($1::jsonb) as x(provider text,player_id text,season int,week int,event_id text,historical_team text,player_name text,position text,played boolean,native_stats jsonb,source_url text)
      on conflict(provider,player_id,season,season_type,week) do update set event_id=excluded.event_id,historical_team=excluded.historical_team,player_name=excluded.player_name,position=excluded.position,played=excluded.played,native_stats=excluded.native_stats,source_url=excluded.source_url,fetched_at=now()`,
        [JSON.stringify(records)],
      );
    if (coverage.length)
      await connection.query(
        `insert into sunday_desk.nfl_stat_coverage(provider,season,resource,row_count)
      select provider,season,resource,row_count from jsonb_to_recordset($1::jsonb) as x(provider text,season int,resource text,row_count int)
      on conflict(provider,season,resource) do update set row_count=excluded.row_count,synced_at=now()`,
        [JSON.stringify(coverage)],
      );
    await connection.query('commit');
  } catch (e) {
    await connection.query('rollback');
    throw e;
  } finally {
    connection.release();
  }
}
export async function readStatCoverage(
  provider: string,
  season: number,
  resources: string[],
  maxAgeMs: number,
) {
  const result = await getPool().query<{ resource: string }>(
    `select resource from sunday_desk.nfl_stat_coverage where provider=$1 and season=$2 and resource=any($3::text[]) and synced_at > now()-($4::double precision * interval '1 millisecond')`,
    [provider, season, resources, maxAgeMs],
  );
  return new Set(result.rows.map((r) => r.resource));
}
export async function readPlayerStats(
  provider: string,
  season: number,
  ids: string[],
) {
  const result = await getPool().query<StatRecord>(
    `select s.provider,s.player_id,s.season,s.week,s.event_id,s.historical_team,s.player_name,s.position,s.played,s.native_stats,s.source_url from sunday_desk.nfl_player_week s left join sunday_desk.nfl_game g on g.event_id=s.event_id and g.season=s.season and g.week=s.week where s.provider=$1 and s.season in ($2,$2-1) and s.player_id=any($3::text[]) and (s.provider <> 'espn' or (g.completed and g.kickoff < now())) order by s.season desc,s.week desc`,
    [provider, season, ids],
  );
  return result.rows;
}
export async function readWeekStats(
  provider: string,
  season: number,
  week: number,
) {
  // Require one unambiguous completed game for the historical team, not its current team.
  return (
    await getPool().query<StatRecord>(
      `select s.* from sunday_desk.nfl_player_week s where provider=$1 and season=$2 and week=$3 and (select count(*)=1 and bool_and(g.completed and g.kickoff<now()) from sunday_desk.nfl_game g where g.season=s.season and g.week=s.week and case when s.provider='espn' then g.event_id=s.event_id else (case s.historical_team when 'WSH' then 'WAS' when 'JAC' then 'JAX' when 'LA' then 'LAR' else s.historical_team end) in (case g.home_team when 'WSH' then 'WAS' when 'JAC' then 'JAX' when 'LA' then 'LAR' else g.home_team end,case g.away_team when 'WSH' then 'WAS' when 'JAC' then 'JAX' when 'LA' then 'LAR' else g.away_team end) end)`,
      [provider, season, week],
    )
  ).rows;
}
export async function statStoreSummary() {
  const result = await getPool().query<{
    provider: string;
    rows: string;
    players: string;
    last_import: Date;
  }>(
    'select provider,count(*)::text as rows,count(distinct player_id)::text as players,max(fetched_at) as last_import from sunday_desk.nfl_player_week group by provider',
  );
  return result.rows.map((r) => ({
    provider: r.provider,
    rows: Number(r.rows),
    players: Number(r.players),
    updatedAt: r.last_import.toISOString(),
  }));
}
