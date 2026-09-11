import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleForecast, snapShare } from '../lib/fantasy/roles.ts';
import { normalizeDepth, matchDepthPlayer } from '../lib/fantasy/depth.ts';
import {
  applyForecast,
  project,
  rankWaivers,
} from '../lib/fantasy/projections.ts';
import { analyze } from '../lib/fantasy/analysis.ts';
import { normalizeESPNStats } from '../lib/fantasy/stat-ingestion.ts';
const now = Date.parse('2026-09-10T12:00:00Z');
const player = (extra = {}) => ({
  id: '2',
  key: '2',
  name: 'Test Player',
  position: 'QB',
  team: 'DET',
  eligible: ['QB'],
  slot: null,
  projection: 24,
  partial: false,
  actual: null,
  injury: 'ACTIVE',
  bye: false,
  kickoff: now + 86400000,
  opponent: 'CHI',
  locked: false,
  reserve: false,
  taxi: false,
  ...extra,
});
const games = (extra = {}) =>
  Array.from({ length: 8 }, (_, i) => ({
    season: 2025,
    week: 18 - i,
    points: 24,
    team: 'DET',
    played: true,
    passAttempts: 30,
    carries: 8,
    targets: 4,
    snaps: 40,
    teamSnaps: 60,
    ...extra,
  }));
const team = (depth = 1, position = 'QB') => ({
  season: 2026,
  team: 'DET',
  checkedAt: new Date(now).toISOString(),
  source: 'Test depth',
  url: 'https://example.com/depth',
  complete: true,
  roster: {
    2: { name: 'Test Player', position, status: 'active', injury: '' },
  },
  players: {
    2: {
      id: '2',
      name: 'Test Player',
      team: 'DET',
      position,
      slot: position,
      depth,
      status: 'active',
      injury: '',
      ahead:
        depth > 1
          ? [{ id: '1', name: 'Starting Player', status: 'active', injury: '' }]
          : [],
    },
  },
});
const forecast = (p = player(), g = games(), t = team(), week = 1) =>
  roleForecast(p, g, t, '2', 2026, week, 1, 0, now);
const league = (players) => ({
  id: 'test',
  platform: 'espn',
  name: 'Test',
  teamName: 'Me',
  url: 'https://example.com',
  status: 'in_season',
  week: 1,
  currentWeek: 1,
  season: 2026,
  fetchedAt: new Date(now).toISOString(),
  scoring: 'PPR',
  source: 'test',
  players,
  slots: [{ id: 'QB:0', key: 'QB', label: 'QB' }],
  standings: [],
  record: '0-0',
  actual: null,
  matchupProjection: null,
  opponent: null,
  warnings: [],
});
void test('past starts do not project a reserve quarterback or make him a waiver pick', () => {
  const result = forecast(player(), games(), team(2));
  assert.equal(result.forecast.baselinePoints, 24);
  assert.equal(result.forecast.points, null);
  assert.equal(result.role.excluded, true);
  assert.deepEqual(result.role.ahead, ['Starting Player']);
  const candidate = applyForecast(player(), result.forecast, result.role);
  const report = {
    league: league([]),
    candidates: [candidate],
    fetchedAt: new Date(now).toISOString(),
    ownershipVerified: true,
  };
  assert.deepEqual(rankWaivers(report, now), []);
});
void test('known reserve can be replaced, unknown role stays held, and kickoff locks still win', () => {
  const reserve = forecast(player({ slot: 'QB:0' }), games(), team(2));
  const held = applyForecast(
    player({ slot: 'QB:0' }),
    reserve.forecast,
    reserve.role,
  );
  const starter = applyForecast(
    player({ id: '1', key: '1' }),
    project(games({ points: 18 }), 2026, 1, 1),
  );
  assert.equal(
    analyze(league([held, starter]), now).assignments[0].recommended.id,
    '1',
  );
  assert.equal(
    analyze(league([{ ...held, modelExcluded: false }, starter]), now)
      .assignments[0].recommended.id,
    '2',
  );
  assert.equal(
    analyze(league([{ ...held, locked: true }, starter]), now).assignments[0]
      .recommended.id,
    '2',
  );
});
void test('inactive, practice squad, free agents and IR remain excluded', () => {
  for (const status of [
    'practiceSquad',
    'injuredReserveOrOut',
    'released',
    'suspended',
  ]) {
    const t = team();
    t.roster['2'].status = status;
    assert.equal(forecast(player(), games(), t).role.excluded, true, status);
  }
  for (const p of [
    player({ team: 'FA' }),
    player({ team: '' }),
    player({ injury: 'OUT' }),
    player({ reserve: true }),
    player({ taxi: true }),
  ])
    assert.equal(forecast(p).role.excluded, true);
});
void test('unknown, stale, future-dated and wrong-season role evidence cannot yield a forecast', () => {
  const unknown = team();
  unknown.roster['2'].status = 'unknown';
  for (const t of [
    undefined,
    { ...team(), checkedAt: new Date(now - 1800001).toISOString() },
    { ...team(), checkedAt: new Date(now + 61000).toISOString() },
    { ...team(), season: 2025 },
    { ...team(), complete: false },
    unknown,
  ]) {
    const r = roleForecast(player(), games(), t, '2', 2026, 1, 1, 0, now);
    assert.equal(r.forecast.points, null);
    assert.equal(r.role.verified, false);
  }
});
void test('old-team stats and an unproven new starter do not carry over a projection', () => {
  assert.equal(
    forecast(player(), games({ team: 'CHI' })).forecast.points,
    null,
  );
  assert.equal(forecast(player(), games().slice(0, 2)).forecast.points, null);
});
void test('a second-unit RB with established rotational snaps remains usable', () => {
  const r = forecast(
    player({ position: 'RB' }),
    games({ snaps: 24, teamSnaps: 60, points: 9 }),
    team(2, 'RB'),
  );
  assert.equal(r.role.status, 'rotation');
  assert.equal(r.forecast.points, 9);
  assert.equal(r.forecast.games, 3);
});
void test('whole-window workload check retains low-target zero-output games', () => {
  const g = games({ snaps: undefined, teamSnaps: undefined })
    .slice(0, 3)
    .map((v, i) => ({ ...v, targets: [8, 1, 7][i], points: [20, 0, 18][i] }));
  const r = forecast(player({ position: 'WR' }), g, team(1, 'WR'));
  assert.equal(r.forecast.points, project(g, 2026, 1, 1).points);
  assert.equal(r.forecast.games, 3);
  assert.ok(r.forecast.history.some((g) => g.points === 0));
});
void test('missing and invalid snaps remain unknown; zero snaps exclude without invented production', () => {
  for (const g of [
    { snaps: 1 },
    { snaps: 80, teamSnaps: 60 },
    { snaps: -1, teamSnaps: 60 },
    { snaps: 0, teamSnaps: 0 },
  ])
    assert.equal(snapShare(g), undefined);
  const r = forecast(
    player({ position: 'WR' }),
    games({ snaps: 0, teamSnaps: 60 }),
    team(1, 'WR'),
  );
  assert.equal(r.role.excluded, true);
  assert.equal(r.forecast.points, null);
});
void test('current charts cannot produce past/future-week forecasts and current stats never enter history', () => {
  assert.equal(forecast(player(), games(), team(), 2).forecast.points, null);
  const r = forecast(player(), [
    ...games(),
    {
      season: 2026,
      week: 1,
      points: 999,
      team: 'DET',
      played: true,
      passAttempts: 50,
    },
  ]);
  assert.equal(r.forecast.points, 24);
  assert.ok(r.forecast.history.every((g) => g.season === 2025));
});
const entry = (id, rank, slot = 1) => ({
  rank,
  slot,
  athlete: {
    $ref: `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/${id}?lang=en`,
  },
});
const formation = (position, athletes) => ({
  id: position,
  name: position,
  positions: { [position]: { position: { abbreviation: position }, athletes } },
});
const roster = {
  season: { year: 2026 },
  team: { id: '8' },
  athletes: [
    {
      position: 'offense',
      items: Array.from({ length: 50 }, (_, i) => ({
        id: String(i + 1),
        fullName: `Player ${i + 1}`,
        position: { abbreviation: i < 3 ? 'QB' : 'WR' },
        status: { type: 'active' },
      })),
    },
  ],
};
const chart = (...items) =>
  normalizeDepth(
    { items },
    roster,
    2026,
    '8',
    'DET',
    new Date(now).toISOString(),
  );
void test('parallel WR rows retain three first-unit receivers and their separate backups', () => {
  const t = chart(
    formation('QB', [entry(1, 1), entry(2, 2)]),
    formation('WR', [
      entry(4, 1, 1),
      entry(5, 2, 2),
      entry(6, 3, 8),
      entry(7, 4, 1),
      entry(8, 5, 2),
      entry(9, 6, 8),
    ]),
  );
  assert.equal(t.complete, true);
  for (const id of ['4', '5', '6']) assert.equal(t.players[id].depth, 1);
  assert.equal(t.players['9'].depth, 2);
  assert.equal(t.players['9'].ahead[0].id, '6');
});
void test('truncated or duplicate ranks never promote a backup', () => {
  for (const entries of [
    [entry(2, 2)],
    [entry(1, 1), entry(2, 3)],
    [entry(1, 1), entry(2, 1)],
  ]) {
    const t = chart(formation('QB', entries));
    assert.equal(t.complete, false);
    assert.deepEqual(t.players, {});
  }
});
void test('ESPN placekicker abbreviation maps to fantasy K in both chart and roster', () => {
  const r = structuredClone(roster);
  r.athletes[0].items[3].position.abbreviation = 'PK';
  const t = normalizeDepth(
    { items: [formation('QB', [entry(1, 1)]), formation('PK', [entry(4, 1)])] },
    r,
    2026,
    '8',
    'DET',
    new Date(now).toISOString(),
  );
  assert.equal(t.players['4'].position, 'K');
  assert.equal(t.roster['4'].position, 'K');
  assert.equal(matchDepthPlayer(t, undefined, 'Player 4', 'K'), '4');
});
void test('a conflicting multi-formation player stays unknown after a later matching duplicate', () => {
  const t = chart(
    formation('QB', [entry(1, 1), entry(2, 2)]),
    formation('QB', [entry(2, 1), entry(1, 2)]),
    formation('QB', [entry(1, 1), entry(2, 2)]),
  );
  assert.equal(t.players['1'], undefined);
  assert.equal(t.players['2'], undefined);
});
void test('identity matching requires exact name and position and rejects ambiguity', () => {
  const t = team();
  assert.equal(matchDepthPlayer(t, '2', 'Test Player', 'QB'), '2');
  assert.equal(matchDepthPlayer(t, '2', 'Someone Else', 'QB'), undefined);
  assert.equal(matchDepthPlayer(t, undefined, 'Tést Player', 'QB'), '2');
  t.roster['3'] = { ...t.roster['2'] };
  assert.equal(matchDepthPlayer(t, undefined, 'Test Player', 'QB'), undefined);
});
void test('ESPN import preserves actual game facts only, including historical team and raw scoring IDs', () => {
  const base = {
    seasonId: 2025,
    scoringPeriodId: 18,
    statSourceId: 0,
    statSplitTypeId: 1,
    externalId: '401',
    proTeamId: 8,
    stats: { 0: 30, 53: 3, 210: 1, 999: Infinity },
  };
  const rows = normalizeESPNStats(
    [
      {
        id: 2,
        fullName: 'Test',
        defaultPositionId: 1,
        proTeamId: 9,
        stats: [
          base,
          { ...base, statSourceId: 1 },
          { ...base, statSplitTypeId: 0 },
          { ...base, scoringPeriodId: 19 },
        ],
      },
    ],
    'https://example.com/stats',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].historical_team, '8');
  assert.equal(rows[0].event_id, '401');
  assert.deepEqual(rows[0].native_stats, { 0: 30, 53: 3, 210: 1 });
  const missing = normalizeESPNStats(
    [
      {
        id: 2,
        fullName: 'Test',
        defaultPositionId: 1,
        proTeamId: 9,
        stats: [{ ...base, proTeamId: undefined, stats: { 53: 0 } }],
      },
    ],
    'https://example.com/stats',
  );
  assert.equal(missing[0].historical_team, null);
  assert.equal(missing[0].played, null);
});
