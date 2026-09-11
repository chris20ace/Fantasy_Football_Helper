import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromESPN, fromSleeper } from '../lib/fantasy/providers.ts';
const season = 2026,
  week = 1;
const entry = (id, slot = 2, points = 12) => ({
  playerId: id,
  lineupSlotId: slot,
  playerPoolEntry: {
    lineupLocked: false,
    player: {
      id,
      fullName: `Player ${id}`,
      defaultPositionId: 2,
      proTeamId: 1,
      eligibleSlots: [2, 23],
      stats: [
        {
          seasonId: season,
          scoringPeriodId: week,
          statSourceId: 1,
          statSplitTypeId: 1,
          appliedTotal: points,
        },
      ],
    },
  },
});
const espn = () => ({
  id: 10,
  status: { latestScoringPeriod: 1 },
  draftDetail: { drafted: true },
  settings: {
    name: 'Test',
    rosterSettings: {
      lineupSlotCounts: { 2: 1, 23: 1 },
      lineupLocktimeType: 'INDIVIDUAL_GAME',
    },
    scheduleSettings: { matchupPeriods: { 1: [1] } },
    scoringSettings: { scoringItems: [{ statId: 53, points: 1 }] },
  },
  teams: [
    {
      id: 1,
      name: 'Us',
      owners: ['{owner}'],
      roster: { entries: [entry(11), entry(12, 23)] },
    },
    {
      id: 2,
      name: 'Them',
      owners: ['private-opponent-owner'],
      roster: { entries: [entry(21), entry(22, 23), entry(23, 20, 90)] },
    },
  ],
  schedule: [
    {
      matchupPeriodId: 1,
      home: {
        teamId: 1,
        pointsByScoringPeriod: { 1: 5 },
        totalPointsLive: 105,
        totalProjectedPointsLive: 160,
      },
      away: {
        teamId: 2,
        pointsByScoringPeriod: { 1: 0 },
        totalPointsLive: 120,
        totalProjectedPointsLive: 150,
      },
    },
  ],
});
const fromE = (raw) => fromESPN(raw, '{owner}', [], week, season);
void test('ESPN opponent normalization keeps own/other starters separate and strips private owners', () => {
  const raw = espn(),
    l = fromE(raw);
  assert.deepEqual(
    l.players.map((p) => p.id),
    ['11', '12'],
  );
  assert.deepEqual(
    l.opponent.players.map((p) => p.id),
    ['21', '22'],
  );
  assert.deepEqual(
    l.opponent.players.map((p) => p.slot),
    ['2:0', '23:0'],
  );
  assert.equal(l.opponent.actual, 0);
  assert.equal(l.actual, 5);
  assert.equal(l.opponent.rosterVerified, true);
  assert.ok(!JSON.stringify(l).includes('private-opponent-owner'));
  const match = raw.schedule[0];
  [match.home, match.away] = [match.away, match.home];
  assert.deepEqual(fromE(raw).opponent, l.opponent);
});
void test('ESPN multiweek matchups never substitute period totals for weekly scores or forecasts', () => {
  const raw = espn();
  raw.settings.scheduleSettings.matchupPeriods = { 1: [1, 2] };
  let l = fromE(raw);
  assert.equal(l.actual, 5);
  assert.equal(l.opponent.actual, 0);
  assert.equal(l.matchupProjection, null);
  assert.equal(l.opponent.projection, null);
  delete raw.schedule[0].home.pointsByScoringPeriod;
  delete raw.schedule[0].away.pointsByScoringPeriod;
  l = fromE(raw);
  assert.equal(l.actual, null);
  assert.equal(l.opponent.actual, null);
});
void test('ESPN rejects ambiguous fixtures, self opponents and absent opponents', () => {
  const raw = espn();
  raw.schedule.push(structuredClone(raw.schedule[0]));
  assert.equal(fromE(raw).opponent, null);
  raw.schedule = [raw.schedule[0]];
  raw.schedule[0].away.teamId = 1;
  assert.equal(fromE(raw).opponent, null);
  raw.schedule[0].away.teamId = 99;
  assert.equal(fromE(raw).opponent, null);
});
void test('ESPN validates duplicate and excess starting entries before filtering them', () => {
  for (const entries of [
    [entry(21), entry(21), entry(22, 23)],
    [entry(21), entry(24), entry(22, 23)],
  ]) {
    const raw = espn();
    raw.teams[1].roster.entries = entries;
    assert.equal(fromE(raw).opponent.rosterVerified, false);
  }
  const raw = espn();
  raw.teams[0].roster.entries.push(entry(11));
  assert.equal(fromE(raw).stale, true);
});
void test('ESPN maintains repeated FLEX slots and non-individual lock restrictions for both sides', () => {
  const raw = espn();
  raw.settings.rosterSettings.lineupSlotCounts[23] = 2;
  raw.teams[0].roster.entries.push(entry(13, 23));
  raw.teams[1].roster.entries.push(entry(24, 23));
  raw.settings.rosterSettings.lineupLocktimeType = 'FIRST_GAME';
  const l = fromE(raw);
  assert.deepEqual(
    l.opponent.players.map((p) => p.slot),
    ['2:0', '23:0', '23:1'],
  );
  assert.ok(
    [...l.players, ...l.opponent.players].every((p) => p.locked === null),
  );
});
const sleeper = () => ({
  raw: {
    league_id: '1',
    name: 'Sleeper test',
    total_rosters: 2,
    status: 'in_season',
    settings: {},
    roster_positions: ['RB', 'FLEX', 'BN'],
    scoring_settings: { rush_yd: 0.1, rec: 1 },
  },
  rosters: [
    {
      roster_id: 1,
      owner_id: 'someone',
      co_owners: ['owner'],
      players: ['11', '12'],
      starters: ['11', '12'],
      settings: {},
    },
    {
      roster_id: 2,
      owner_id: 'other',
      players: ['21', '22'],
      starters: ['21', '22'],
      settings: {},
    },
  ],
  matches: [
    {
      roster_id: 1,
      matchup_id: 0,
      players: ['11', '12'],
      starters: ['11', '12'],
      points: 12,
      custom_points: 0,
      players_points: { 11: 3, 12: 9 },
    },
    {
      roster_id: 2,
      matchup_id: 0,
      players: ['21', '22'],
      starters: ['0', '22'],
      points: 8,
      players_points: { 21: 40, 22: 8 },
    },
  ],
  users: [
    { user_id: 'someone', display_name: 'Us' },
    { user_id: 'other', display_name: 'Them', private: 'hidden' },
  ],
  details: Object.fromEntries(
    ['11', '12', '21', '22', '23'].map((id) => [
      id,
      {
        full_name: `Player ${id}`,
        position: 'RB',
        team: 'DET',
        fantasy_positions: ['RB'],
      },
    ]),
  ),
  projections: ['11', '12', '21', '22', '23'].map((player_id) => ({
    player_id,
    stats: { rush_yd: 60, rec: 4 },
  })),
});
const fromS = (s) =>
  fromSleeper(
    s.raw,
    s.rosters,
    s.matches,
    s.users,
    s.details,
    s.projections,
    [],
    week,
    season,
    week,
    'owner',
  );
void test('Sleeper co-owned roster, matchup zero, empty slot index and score override are preserved', () => {
  const s = sleeper(),
    l = fromS(s);
  assert.equal(l.actual, 0);
  assert.equal(l.opponent.actual, 8);
  assert.equal(l.opponent.name, 'Them');
  assert.equal(l.opponent.rosterVerified, true);
  assert.deepEqual(
    l.opponent.players.map((p) => [p.id, p.slot, p.actual]),
    [['22', 'FLEX:1', 8]],
  );
  assert.ok(!JSON.stringify(l).includes('hidden'));
  assert.ok(!l.players.some((p) => p.id === '22'));
});
void test('Sleeper same scoring rules apply to both teams, including PPR', () => {
  const s = sleeper();
  let l = fromS(s);
  assert.equal(l.players[0].projection, 10);
  assert.equal(l.opponent.players[0].projection, 10);
  s.raw.scoring_settings.rec = 0;
  l = fromS(s);
  assert.equal(l.players[0].projection, 6);
  assert.equal(l.opponent.players[0].projection, 6);
});
void test('Sleeper includes submitted starter absent from the latest roster and does not collapse empty slots', () => {
  const s = sleeper();
  s.matches[1].starters = ['0', '23'];
  const l = fromS(s);
  assert.deepEqual(
    l.opponent.players.map((p) => [p.id, p.slot]),
    [['23', 'FLEX:1']],
  );
  assert.equal(l.opponent.rosterVerified, true);
});
void test('Sleeper rejects null matchup pairs and ambiguous peers', () => {
  const s = sleeper();
  s.matches.forEach((m) => (m.matchup_id = null));
  assert.equal(fromS(s).opponent, null);
  s.matches.forEach((m) => (m.matchup_id = 1));
  s.matches.push({ ...s.matches[1], roster_id: 3 });
  assert.equal(fromS(s).opponent, null);
  s.matches = [];
  assert.equal(fromS(s).opponent, null);
});
void test('Sleeper duplicated or truncated starter lists remain unverified', () => {
  const s = sleeper();
  s.matches[1].starters = ['22', '22'];
  assert.equal(fromS(s).opponent.rosterVerified, false);
  s.matches[1].starters = ['22'];
  assert.equal(fromS(s).opponent.rosterVerified, false);
  s.matches[0].starters = ['11', '11'];
  assert.equal(fromS(s).stale, true);
});
