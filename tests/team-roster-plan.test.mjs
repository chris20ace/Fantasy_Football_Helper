import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTeamRosterPlan,
  fitWeeklyRoster,
} from '../lib/fantasy/team-roster-plan.ts';
import { analyze } from '../lib/fantasy/analysis.ts';
const now = 100000;
const slot = (key, i = 0) => ({ id: `${key}:${i}`, key, label: key });
const player = (id, pos, projection, extra = {}) => ({
  id,
  key: id,
  name: id,
  position: pos,
  team: 'DET',
  eligible: [
    pos,
    ...(['RB', 'WR', 'TE'].includes(pos) ? ['FLEX'] : []),
    'SUPERFLEX',
  ],
  slot: null,
  projection,
  actual: null,
  partial: false,
  injury: 'ACTIVE',
  bye: false,
  byeWeek: 8,
  kickoff: now + 100000,
  gameStatus: 'scheduled',
  opponent: 'CHI',
  locked: false,
  reserve: false,
  taxi: false,
  ...extra,
});
const report = (
  players,
  slots,
  candidates = [],
  bench = players.length - slots.length,
) => ({
  projectionSource: 'provider',
  fetchedAt: new Date(now).toISOString(),
  ownershipVerified: true,
  candidates,
  evaluated: candidates.length,
  warnings: [],
  league: {
    id: 'sleeper:1',
    platform: 'sleeper',
    name: 'League',
    teamName: 'Team',
    url: 'https://sleeper.com',
    status: 'in_season',
    week: 1,
    currentWeek: 1,
    season: 2026,
    fetchedAt: new Date(now).toISOString(),
    scoring: 'PPR',
    source: 'Provider',
    players,
    slots,
    standings: [],
    record: '0-0',
    actual: null,
    matchupProjection: null,
    opponent: null,
    warnings: [],
    rosterRules: {
      teams: 12,
      benchSlots: bench,
      irSlots: 0,
      taxiSlots: 0,
      format: 'keeper',
      bestBall: false,
      receptionPoints: 1,
      teReceptionBonus: 0,
    },
  },
});
const moves = (p) => [...p.upgrades, ...p.depthMoves, ...p.streams];

void test('higher raw QB points do not make an improvement over a stronger owned QB', () => {
  const r = report(
    [
      player('QB', 'QB', 24, { slot: 'QB:0' }),
      player('RB', 'RB', 9, { slot: 'RB:0' }),
      player('bench', 'RB', 3),
    ],
    [slot('QB'), slot('RB')],
    [player('waiver', 'QB', 20)],
  );
  assert.equal(buildTeamRosterPlan(r, now).upgrades.length, 0);
});
void test('full add/drop uses net optimized points; losing a required starter cannot be advertised as add-only gain', () => {
  const r = report(
    [
      player('RB', 'RB', 10, { slot: 'RB:0' }),
      player('WR', 'WR', 10, { slot: 'WR:0' }),
    ],
    [slot('RB'), slot('WR')],
    [player('upgrade', 'WR', 14)],
  );
  const p = buildTeamRosterPlan(r, now, ['WR']);
  assert.equal(p.upgrades.length, 0);
  assert.equal(
    fitWeeklyRoster(r.league, [r.league.players[1], r.candidates[0]], now)
      .filled,
    1,
  );
});
void test('names an actual affordable swap and Keep excludes that drop without mutating the report', () => {
  const r = report(
    [player('QB', 'QB', 10, { slot: 'QB:0' }), player('bench', 'WR', 2)],
    [slot('QB')],
    [player('newQB', 'QB', 15)],
  );
  const before = structuredClone(r);
  const p = buildTeamRosterPlan(r, now);
  assert.equal(p.upgrades[0].gain, 5);
  assert.equal(p.upgrades[0].drop.id, 'bench');
  assert.ok(
    moves(buildTeamRosterPlan(r, now, ['bench'])).every(
      (m) => m.drop?.id !== 'bench',
    ),
  );
  assert.deepEqual(r, before);
});
void test('zero is valid cover, not missing; a more productive backup is a measured depth decision', () => {
  const r = report(
    [
      player('QB', 'QB', 20, { slot: 'QB:0' }),
      player('TE', 'TE', 10, { slot: 'TE:0' }),
      player('backupQB', 'QB', 19),
      player('prospect', 'QB', 0),
    ],
    [slot('QB'), slot('TE')],
    [player('backupTE', 'TE', 8)],
  );
  const p = buildTeamRosterPlan(r, now);
  assert.equal(p.analysis.review.length, 0);
  assert.equal(p.depthMoves[0].drop.id, 'prospect');
  assert.equal(p.depthMoves[0].gain, 0);
  assert.equal(p.depthMoves[0].depth.starter.id, 'TE');
  assert.equal(p.depthMoves[0].depth.gain, 8);
  assert.equal(
    p.bench.find((b) => b.player.id === 'backupQB').protects.points,
    19,
  );
});
void test('an injury-related zero is retained instead of used as the default weakest asset', () => {
  const r = report(
    [
      player('QB', 'QB', 10, { slot: 'QB:0' }),
      player('injured', 'RB', 0, { injury: 'DAY_TO_DAY' }),
      player('bench', 'WR', 5),
    ],
    [slot('QB')],
    [player('newQB', 'QB', 15)],
  );
  assert.ok(
    moves(buildTeamRosterPlan(r, now)).every((m) => m.drop?.id !== 'injured'),
  );
  assert.equal(buildTeamRosterPlan(r, now).upgrades[0].drop.id, 'bench');
});
void test('streaming replaces the same position instead of dropping skill depth', () => {
  const r = report(
    [player('K', 'K', 7, { slot: 'K:0' }), player('WR', 'WR', 0)],
    [slot('K')],
    [player('newK', 'K', 8)],
  );
  assert.equal(buildTeamRosterPlan(r, now).streams[0].drop.id, 'K');
});
void test('negative provider projections remain real values and fill an otherwise empty legal slot', () => {
  const r = report(
    [player('negative', 'RB', -2, { slot: 'RB:0' })],
    [slot('RB')],
  );
  assert.equal(fitWeeklyRoster(r.league, r.league.players, now).total, -2);
  assert.equal(buildTeamRosterPlan(r, now).analysis.review.length, 0);
});
void test('locked FLEX never moves and played bench actual points never join the lineup or drop candidates', () => {
  const r = report(
    [
      player('locked', 'RB', 99, {
        slot: 'FLEX:0',
        actual: 5,
        gameStatus: 'final',
        kickoff: 1,
      }),
      player('RB', 'RB', 8, { slot: 'RB:0' }),
      player('playedBench', 'RB', 50, {
        actual: 35,
        gameStatus: 'final',
        kickoff: 1,
      }),
    ],
    [slot('RB'), slot('FLEX')],
    [player('newRB', 'RB', 12)],
  );
  const p = buildTeamRosterPlan(r, now);
  assert.equal(p.baseline.total, 13);
  assert.equal(
    p.baseline.assignments.find((a) => a.slot.key === 'FLEX').player.id,
    'locked',
  );
  for (const m of moves(p)) {
    assert.notEqual(m.drop?.id, 'playedBench');
    assert.notEqual(m.drop?.id, 'locked');
    assert.equal(
      m.after.assignments.find((a) => a.slot.key === 'FLEX').player.id,
      'locked',
    );
  }
});
void test('missing locked actuals keep totals pending but do not hide independent upcoming changes', () => {
  const r = report(
    [
      player('locked', 'WR', 30, {
        slot: 'WR:0',
        actual: null,
        gameStatus: 'final',
        kickoff: 1,
      }),
      player('RB', 'RB', 8, { slot: 'RB:0' }),
      player('better', 'RB', 10),
    ],
    [slot('RB'), slot('WR')],
    [player('newRB', 'RB', 15)],
  );
  const p = buildTeamRosterPlan(r, now);
  assert.equal(p.baseline.total, null);
  assert.ok(p.repairs.some((a) => a.recommended.id === 'better'));
  assert.equal(p.upgrades[0].gain, 5);
  assert.equal(p.upgrades[0].after.total, null);
});
void test('unknown forecasts or locks, stale data, noncurrent leagues and nonprovider sources pause full comparisons', () => {
  for (const mutate of [
    (r) => (r.league.players[0].projection = null),
    (r) => (r.league.players[0].locked = null),
    (r) => (r.league.players[0].partial = true),
    (r) => (r.fetchedAt = new Date(now - 300001).toISOString()),
    (r) => (r.league.week = 2),
    (r) => (r.league.status = 'pre_draft'),
    (r) => (r.projectionSource = 'model'),
    (r) => (r.ownershipVerified = false),
    (r) => (r.league.rosterRules.bestBall = true),
  ]) {
    const r = report(
      [player('QB', 'QB', 10, { slot: 'QB:0' }), player('bench', 'WR', 2)],
      [slot('QB')],
      [player('newQB', 'QB', 15)],
    );
    mutate(r);
    assert.equal(moves(buildTeamRosterPlan(r, now)).length, 0);
  }
});
void test('empty lineup slot is not free capacity; unknown capacity requires a conditional drop and overfull stops swaps', () => {
  const r = report(
    [player('owned', 'WR', 4)],
    [slot('QB')],
    [player('newQB', 'QB', 15)],
    0,
  );
  assert.equal(buildTeamRosterPlan(r, now).upgrades[0].drop.id, 'owned');
  r.league.rosterRules.benchSlots = null;
  assert.equal(buildTeamRosterPlan(r, now).upgrades[0].drop.id, 'owned');
  r.league.rosterRules.benchSlots = 0;
  r.league.players.push(player('extra', 'WR', 3));
  assert.equal(moves(buildTeamRosterPlan(r, now)).length, 0);
});
void test('provider roster locks, transaction locks and positive position caps gate comparisons', () => {
  const r = report(
    [
      player('QB', 'QB', 10, { slot: 'QB:0', dropLocked: true }),
      player('bench', 'WR', 2, { dropLocked: true }),
    ],
    [slot('QB')],
    [player('newQB', 'QB', 15)],
  );
  assert.equal(moves(buildTeamRosterPlan(r, now)).length, 0);
  r.league.players[1].dropLocked = false;
  r.league.rosterRules.positionLimits = { QB: 1 };
  assert.equal(moves(buildTeamRosterPlan(r, now)).length, 0);
  delete r.league.rosterRules.positionLimits;
  r.league.transactionLocked = true;
  assert.equal(moves(buildTeamRosterPlan(r, now)).length, 0);
});
void test('a bye conflict from the exact drop is exposed, and unknown candidate byes never establish coverage', () => {
  const r = report(
    [
      player('QB', 'QB', 10, { slot: 'QB:0', byeWeek: 3 }),
      player('backup', 'QB', 5, { byeWeek: 8 }),
    ],
    [slot('QB')],
    [player('newQB', 'QB', 15, { byeWeek: 3 })],
  );
  const p = buildTeamRosterPlan(r, now, ['QB']);
  assert.deepEqual(p.upgrades[0].byeHarm, [3]);
  r.candidates[0].projection = 9;
  r.candidates[0].byeWeek = null;
  assert.ok(
    moves(buildTeamRosterPlan(r, now, ['QB'])).every(
      (m) => !m.byeHelp.includes(3),
    ),
  );
});
void test('superflex backup protects real points even when it adds nothing to the healthy lineup', () => {
  const r = report(
    [
      player('Q1', 'QB', 20, { slot: 'QB:0' }),
      player('Q2', 'QB', 18, { slot: 'SUPERFLEX:0' }),
      player('Q3', 'QB', 16),
      player('WR', 'WR', 10),
    ],
    [slot('QB'), slot('SUPERFLEX')],
  );
  const b = buildTeamRosterPlan(r, now).bench.find((b) => b.player.id === 'Q3');
  assert.equal(b.protects.points, 6);
});
void test('candidate and drop eligibility are recomputed when kickoff passes', () => {
  const r = report(
    [player('QB', 'QB', 10, { slot: 'QB:0' }), player('bench', 'WR', 2)],
    [slot('QB')],
    [player('newQB', 'QB', 15, { kickoff: now + 1 })],
  );
  assert.ok(buildTeamRosterPlan(r, now).upgrades.length);
  assert.equal(moves(buildTeamRosterPlan(r, now + 2)).length, 0);
});
void test('exact assignment matches canonical lineup objective across randomized FLEX, superflex and negative-score rosters', () => {
  let seed = 387;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let t = 0; t < 160; t++) {
    const slots = [
      slot('QB'),
      slot('RB'),
      slot('WR'),
      slot('FLEX'),
      slot('SUPERFLEX'),
    ];
    const players = Array.from({ length: 9 }, (_, i) => {
      const pos = ['QB', 'RB', 'WR', 'TE'][Math.floor(rand() * 4)];
      return player(`p${i}`, pos, Math.round((rand() * 30 - 3) * 100) / 100);
    });
    const r = report(players, slots);
    const expected = analyze(r.league, now),
      actual = fitWeeklyRoster(r.league, players, now);
    assert.equal(
      actual.filled,
      expected.assignments.filter((a) => a.recommended).length,
    );
    const sum = expected.assignments.reduce(
      (a, b) => a + (b.recommended?.projection ?? 0),
      0,
    );
    assert.ok(
      Math.abs(actual.score - sum) < 0.00011,
      `trial ${t}: ${actual.score} vs ${sum}`,
    );
    assert.equal(
      new Set(
        actual.assignments.flatMap((a) => (a.player ? [a.player.id] : [])),
      ).size,
      actual.filled,
    );
  }
});

void test('repairing an unrelated empty slot does not conceal lost contingency coverage', () => {
  const r = report(
    [player('RB', 'RB', 10, { slot: 'RB:0' }), player('backup', 'RB', 7)],
    [slot('RB'), slot('WR')],
    [player('newWR', 'WR', 12)],
    0,
  );
  const p = buildTeamRosterPlan(r, now, ['RB']);
  const m = p.upgrades[0];
  assert.equal(m.kind, 'repair');
  assert.equal(m.drop.id, 'backup');
  assert.equal(m.depthLoss.starter.id, 'RB');
  assert.equal(m.depthLoss.coverage, -1);
  assert.equal(m.depth, null);
});
void test('an unknown bye does not become a confirmed per-player backup role', () => {
  const r = report(
    [
      player('QB', 'QB', 15, { slot: 'QB:0', byeWeek: 2 }),
      player('backup', 'QB', 10, { byeWeek: null }),
    ],
    [slot('QB')],
  );
  const p = buildTeamRosterPlan(r, now);
  assert.equal(p.byes[0].uncertain, true);
  assert.deepEqual(p.bench[0].coversByes, []);
});
void test('negligible streaming edges are omitted without changing provider projections', () => {
  const r = report(
    [player('K', 'K', 7, { slot: 'K:0' })],
    [slot('K')],
    [player('newK', 'K', 7.01)],
  );
  assert.equal(buildTeamRosterPlan(r, now).streams.length, 0);
  assert.equal(r.candidates[0].projection, 7.01);
});
