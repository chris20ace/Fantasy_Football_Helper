import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../lib/fantasy/analysis.ts';
import { playerPoints } from '../lib/fantasy/points.ts';
import {
  fromESPN,
  fromSleeper,
  espnPlayer,
  selectSleeperProjections,
  gameInfo,
} from '../lib/fantasy/providers.ts';
const season = 2026,
  week = 1;
void test('ESPN uses only the exact weekly native appliedTotal, preserving zero and negative estimates', () => {
  for (const value of [0, -2, 21.37]) {
    const p = {
      playerPoolEntry: {
        player: {
          id: 1,
          stats: [
            {
              seasonId: season,
              scoringPeriodId: week + 1,
              statSourceId: 1,
              statSplitTypeId: 1,
              appliedTotal: 999,
            },
            {
              seasonId: season - 1,
              scoringPeriodId: week,
              statSourceId: 1,
              statSplitTypeId: 1,
              appliedTotal: 999,
            },
            {
              seasonId: season,
              scoringPeriodId: week,
              statSourceId: 0,
              statSplitTypeId: 1,
              appliedTotal: 999,
            },
            {
              seasonId: season,
              scoringPeriodId: week,
              statSourceId: 1,
              statSplitTypeId: 0,
              appliedTotal: 999,
            },
            {
              seasonId: season,
              scoringPeriodId: week,
              statSourceId: 1,
              statSplitTypeId: 1,
              appliedTotal: value,
            },
          ],
        },
      },
    };
    assert.equal(espnPlayer(p, [], week, season, week, null).projection, value);
    p.playerPoolEntry.player.stats.pop();
    assert.equal(espnPlayer(p, [], week, season, week, null).projection, null);
  }
});
void test('Sleeper selects the latest weekly provider projection without accepting actuals or another week', () => {
  const row = {
    player_id: '1',
    season: String(season),
    week,
    company: 'rotowire',
    category: 'proj',
    season_type: 'regular',
    updated_at: 100,
    stats: { rec: 5 },
  };
  const latest = { ...row, updated_at: 200, stats: { rec: 6 } };
  const rows = [
    row,
    latest,
    { ...row, week: 2 },
    { ...row, season: '2025' },
    { ...row, category: 'stat' },
    { ...row, company: 'unknown' },
  ];
  assert.deepEqual(selectSleeperProjections(rows, season, week), [latest]);
  assert.deepEqual(selectSleeperProjections([{}], season, week), []);
});
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
    season: String(season),
    week,
    season_type: 'regular',
    category: 'proj',
    company: 'rotowire',
    player_id,
    stats: { rush_yd: 60, rec: 4 },
  })),
});
const fromS = (s, proTeams = []) =>
  fromSleeper(
    s.raw,
    s.rosters,
    s.matches,
    s.users,
    s.details,
    s.projections,
    proTeams,
    week,
    season,
    week,
    'owner',
  );
void test('roster metadata distinguishes configured capacity, format and unknown rules', () => {
  const s = sleeper();
  s.raw.settings = { type: 2, best_ball: 0, reserve_slots: 2, taxi_slots: 3 };
  s.raw.scoring_settings.bonus_rec_te = 0.5;
  const rules = fromS(s).rosterRules;
  assert.equal(rules.benchSlots, 1);
  assert.equal(rules.irSlots, 2);
  assert.equal(rules.taxiSlots, 3);
  assert.equal(rules.format, 'dynasty');
  assert.equal(rules.bestBall, false);
  assert.equal(rules.teReceptionBonus, 0.5);
  for (const [value, expected] of [
    [0, 'redraft'],
    [1, 'keeper'],
    [3, 'special'],
    [99, 'unknown'],
  ]) {
    s.raw.settings.type = value;
    assert.equal(fromS(s).rosterRules.format, expected);
  }
  const e = espn();
  e.settings.rosterSettings.lineupSlotCounts[20] = 5;
  e.settings.rosterSettings.lineupSlotCounts[21] = 2;
  assert.equal(fromE(e).rosterRules.benchSlots, 5);
  assert.equal(fromE(e).rosterRules.irSlots, 2);
  assert.equal(fromE(e).rosterRules.format, 'unknown');
  e.settings.rosterSettings.lineupSlotCounts[24] = 1;
  assert.equal(fromE(e).rosterRules.benchSlots, null);
  delete e.settings.rosterSettings;
  assert.equal(fromE(e).rosterRules.benchSlots, null);
});
void test('future bye metadata preserves only confirmed valid weeks', () => {
  assert.equal(gameInfo('DET', [{ abbrev: 'DET', byeWeek: 5 }], 1).byeWeek, 5);
  assert.equal(gameInfo('DET', [{ abbrev: 'DET', byeWeek: 5 }], 5).bye, true);
  for (const byeWeek of [null, undefined, 0, -1, 19, 2.5, '5'])
    assert.equal(
      gameInfo('DET', [{ abbrev: 'DET', byeWeek }], 1).byeWeek,
      null,
    );
  assert.equal(gameInfo('FA', [], 1).byeWeek, null);
});
void test('Sleeper zero rows participate in lineup comparison without a missing-projection warning', () => {
  const now = Date.now();
  const proTeams = [
    {
      id: 1,
      abbrev: 'DET',
      proGamesByScoringPeriod: {
        [week]: [{ date: now + 3600000, gameStatus: 'scheduled' }],
      },
    },
  ];
  for (const stats of [{ adp_dd_ppr: 1000 }, {}, { rush_yd: 0, rec: 0 }]) {
    const s = sleeper();
    s.rosters[0].players.push('23');
    s.projections.find((p) => p.player_id === '11').stats = stats;
    const l = fromS(s, proTeams),
      zero = l.players.find((p) => p.id === '11');
    assert.equal(zero.projection, 0);
    assert.deepEqual(playerPoints(zero, now), {
      value: 0,
      basis: 'projection',
      label: 'Proj.',
    });
    const a = analyze(l, now);
    assert.equal(a.complete, true);
    assert.deepEqual(a.review, []);
    assert.equal(a.currentTotal, 10);
    assert.equal(a.recommendedTotal, 20);
    assert.equal(a.gain, 10);
    assert.equal(a.assignments[0].recommended.id, '23');
    // A zero bench projection also counts as covered data.
    s.projections.find((p) => p.player_id === '11').stats = {
      rush_yd: 60,
      rec: 4,
    };
    s.projections.find((p) => p.player_id === '23').stats = stats;
    const bench = analyze(fromS(s, proTeams), now);
    assert.equal(bench.complete, true);
    assert.equal(bench.gain, 0);
    assert.deepEqual(bench.review, []);
  }
});
void test('an absent or malformed weekly row stays missing instead of becoming a zero projection', () => {
  for (const stats of [null, undefined, []]) {
    const s = sleeper();
    s.projections.find((p) => p.player_id === '11').stats = stats;
    assert.equal(fromS(s).players.find((p) => p.id === '11').projection, null);
  }
  const s = sleeper();
  s.projections = [];
  assert.ok(fromS(s).players.every((p) => p.projection === null));
  s.projections = sleeper().projections.map((p) => ({ ...p, week: week + 1 }));
  assert.ok(fromS(s).players.every((p) => p.projection === null));
});
void test('Sleeper AutoSubs settings do not change player locks or add warnings', () => {
  const s = sleeper();
  s.raw.roster_positions = ['FLEX', 'RB', 'BN'];
  s.details['11'] = {
    full_name: 'Played WR',
    position: 'WR',
    fantasy_positions: ['WR'],
    team: 'LAR',
  };
  const proTeams = [
    {
      id: 1,
      abbrev: 'LAR',
      proGamesByScoringPeriod: {
        [week]: [{ date: Date.now() - 3600000, gameStatus: 'final' }],
      },
    },
    {
      id: 2,
      abbrev: 'DET',
      proGamesByScoringPeriod: {
        [week]: [{ date: Date.now() + 3600000, gameStatus: 'scheduled' }],
      },
    },
  ];
  s.raw.settings.max_subs = 0;
  const baseline = fromS(s, proTeams);
  assert.deepEqual(
    baseline.players.map((p) => p.locked),
    [true, false],
  );
  assert.equal(baseline.players[0].actual, 3);
  for (const max_subs of [1, 3]) {
    s.raw.settings.max_subs = max_subs;
    const enabled = fromS(s, proTeams);
    assert.deepEqual(enabled.players, baseline.players);
    assert.deepEqual(enabled.warnings, baseline.warnings);
    assert.ok(!JSON.stringify(enabled).match(/autoSub|lockReason/i));
  }
});
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

void test('ESPN preserves transaction and roster locks separately and maps positive primary-position limits', () => {
  const raw = espn();
  raw.teams[0].isTransactionLocked = true;
  raw.settings.rosterSettings.positionLimits = {
    1: 3,
    2: 8,
    16: 2,
    23: 99,
    3: -1,
  };
  raw.settings.rosterSettings.isUsingUndroppableList = true;
  raw.settings.rosterSettings.rosterLocktimeType = 'INDIVIDUAL_GAME';
  raw.teams[0].roster.entries[0].playerPoolEntry.rosterLocked = true;
  raw.teams[0].roster.entries[0].pendingTransactionIds = ['pending'];
  const l = fromE(raw);
  assert.equal(l.transactionLocked, true);
  assert.equal(l.players[0].locked, false);
  assert.equal(l.players[0].dropLocked, true);
  assert.equal(l.players[0].pendingTransaction, true);
  assert.deepEqual(l.rosterRules.positionLimits, { QB: 3, RB: 8, DEF: 2 });
  assert.equal(l.rosterRules.usesUndroppableList, true);
  assert.equal(fromE(espn()).transactionLocked, null);
  assert.equal(fromE(espn()).players[0].dropLocked, null);
});
