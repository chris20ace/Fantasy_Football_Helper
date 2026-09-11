import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../lib/accounts/db.ts';
import {
  saveGames,
  writeStatBatch,
  readPlayerStats,
  readWeekStats,
} from '../lib/fantasy/stat-store.ts';
const pool = getPool(),
  id = `nfl-test-${randomUUID()}`,
  season = 2099,
  source = 'https://example.test/' + id;
let reserved = false;
const client = await pool.connect();
try {
  // Serialize this integration fixture and never reuse a season containing existing data.
  await client.query('begin');
  await client.query(
    "select pg_advisory_xact_lock(hashtext('sunday-desk-nfl-stat-test'))",
  );
  const existing = await client.query(
    'select 1 from sunday_desk.nfl_game where season=$1 union all select 1 from sunday_desk.nfl_stat_coverage where season=$1 union all select 1 from sunday_desk.nfl_player_week where season=$1 limit 1',
    [season],
  );
  assert.equal(
    existing.rowCount,
    0,
    'Fixture season is in use; refusing to modify it',
  );
  reserved = true;
  const g = {
    event_id: id,
    season,
    week: 1,
    kickoff: '2000-01-01T12:00:00Z',
    completed: false,
    home_team_id: '8',
    away_team_id: '3',
    home_team: 'DET',
    away_team: 'CHI',
    home_score: 0,
    away_score: 0,
    source_url: source,
  };
  const row = {
    player_id: id,
    season,
    week: 1,
    event_id: id,
    historical_team: '8',
    player_name: 'Synthetic integration fixture',
    position: 'WR',
    played: true,
    native_stats: { 53: 3, 210: 1 },
    source_url: source,
  };
  await saveGames([g], season);
  await writeStatBatch(
    [
      { ...row, provider: 'espn' },
      {
        ...row,
        provider: 'sleeper',
        event_id: null,
        historical_team: 'DET',
        native_stats: { rec: 3, gp: 1 },
      },
    ],
    [{ provider: 'espn', season, resource: 'player:' + id, row_count: 1 }],
  );
  assert.equal(
    (await readPlayerStats('espn', season, [id])).length,
    0,
    'unfinished ESPN game',
  );
  assert.equal(
    (await readWeekStats('sleeper', season, 1)).length,
    0,
    'unfinished Sleeper game',
  );
  await saveGames([{ ...g, completed: true, week: 2 }], season);
  assert.equal(
    (await readPlayerStats('espn', season, [id])).length,
    0,
    'corrected week must be updated and match stats',
  );
  await saveGames([{ ...g, completed: true }], season);
  assert.equal((await readPlayerStats('espn', season, [id])).length, 1);
  assert.equal((await readWeekStats('sleeper', season, 1)).length, 1);
  await writeStatBatch(
    [{ ...row, provider: 'espn', native_stats: { 53: 4, 210: 1 } }],
    [],
  );
  const actual = await readPlayerStats('espn', season, [id]);
  assert.equal(actual.length, 1);
  assert.equal(actual[0].native_stats['53'], 4, 'idempotent stat correction');
  await saveGames(
    [
      {
        ...g,
        event_id: id + '-ambiguous',
        completed: true,
        away_team: 'GB',
        away_team_id: '9',
      },
    ],
    season,
  );
  assert.equal(
    (await readWeekStats('sleeper', season, 1)).length,
    0,
    'ambiguous historical team/game match',
  );
  assert.equal(
    (await readPlayerStats('espn', season, [id])).length,
    1,
    'exact event ID remains unambiguous',
  );
  const access = await client.query(
    'select rolbypassrls from pg_roles where rolname=current_user',
  );
  assert.equal(access.rows[0].rolbypassrls, false);
  const policies = await client.query(
    "select relrowsecurity from pg_class where relnamespace='sunday_desk'::regnamespace and relname=any($1::text[])",
    [
      [
        'nfl_game',
        'nfl_player_week',
        'nfl_depth_snapshot',
        'nfl_stat_coverage',
      ],
    ],
  );
  assert.equal(policies.rows.length, 4);
  assert.ok(policies.rows.every((r) => r.relrowsecurity));
  console.log(
    'PASS: completed-game checks for both providers, exact event/week matching, corrected upserts, duplicate prevention, ambiguity rejection and server-only RLS.',
  );
} finally {
  if (reserved) {
    await client.query(
      'delete from sunday_desk.nfl_player_week where player_id=$1',
      [id],
    );
    await client.query('delete from sunday_desk.nfl_game where source_url=$1', [
      source,
    ]);
    await client.query(
      "delete from sunday_desk.nfl_stat_coverage where season=$1 and (resource='games' or resource=$2)",
      [season, 'player:' + id],
    );
  }
  await client.query('commit');
  client.release();
  await pool.end();
}
