import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRosterPlan,
  matchRosterSlots,
  weeklyBackup,
} from '../lib/fantasy/roster-construction.ts';
const now = 100000;
const slot = (label, i = 0) => ({ id: `${label}:${i}`, key: label, label });
const player = (id, position, extra = {}) => ({
  id,
  key: id,
  name: id,
  position,
  team: 'DET',
  eligible: [position, 'FLEX'],
  slot: null,
  projection: 10,
  partial: false,
  actual: null,
  injury: 'ACTIVE',
  bye: false,
  byeWeek: 8,
  gameStatus: 'scheduled',
  kickoff: now + 100000,
  opponent: '@ CHI',
  locked: false,
  reserve: false,
  taxi: false,
  ...extra,
});
const report = (players, slots = [slot('RB')], candidates = []) => ({
  projectionSource: 'provider',
  fetchedAt: new Date(now).toISOString(),
  ownershipVerified: true,
  candidates,
  evaluated: candidates.length,
  warnings: [],
  league: {
    id: 'sleeper:1',
    platform: 'sleeper',
    name: 'Test',
    teamName: 'Us',
    status: 'in_season',
    week: 1,
    currentWeek: 1,
    season: 2026,
    fetchedAt: new Date(now).toISOString(),
    source: 'Provider',
    scoring: 'PPR',
    players,
    slots,
    standings: [],
    record: '0–0',
    actual: null,
    matchupProjection: null,
    opponent: null,
    warnings: [],
    rosterRules: {
      teams: 12,
      benchSlots: 2,
      irSlots: 1,
      taxiSlots: 1,
      format: 'redraft',
      bestBall: false,
      receptionPoints: 1,
      teReceptionBonus: 0,
    },
  },
});
void test('coverage assigns a dual-eligible player only once and rearranges FLEX for mandatory slots', () => {
  const roster = [
    player('flex', 'RB', { eligible: ['RB', 'WR', 'FLEX'] }),
    player('receiver', 'WR', { eligible: ['WR'] }),
  ];
  assert.equal(matchRosterSlots([slot('WR'), slot('FLEX')], roster).filled, 2);
  assert.equal(
    matchRosterSlots([slot('RB'), slot('WR'), slot('FLEX')], roster).filled,
    2,
  );
  assert.equal(
    matchRosterSlots([slot('FLEX'), slot('FLEX', 1)], [roster[0], roster[0]])
      .filled,
    1,
  );
});
void test('an empty starter does not create a free roster spot and IR/taxi are separate', () => {
  const r = report([
    player('a', 'RB'),
    player('b', 'RB'),
    player('c', 'RB'),
    player('ir', 'RB', { reserve: true }),
    player('taxi', 'RB', { taxi: true }),
  ]);
  const plan = buildRosterPlan(r, now);
  assert.equal(plan.bench, 3);
  assert.equal(plan.capacity, 3);
  assert.equal(plan.free, 0);
  assert.equal(plan.ir, 1);
  assert.equal(plan.taxi, 1);
  assert.equal(plan.rows[0].ready.length, 3);
  delete r.league.rosterRules;
  assert.equal(buildRosterPlan(r, now).free, null);
});
void test('zero and negative provider projections are valid weekly cover; missing estimates are unknown', () => {
  const p = player('zero', 'RB', { projection: 0 });
  assert.equal(weeklyBackup(p, now), true);
  assert.equal(weeklyBackup({ ...p, projection: -2 }, now), true);
  assert.equal(weeklyBackup({ ...p, projection: null }, now), false);
  assert.equal(weeklyBackup({ ...p, partial: true }, now), false);
  const r = report([player('starter', 'RB', { slot: 'RB:0' }), p]);
  const before = structuredClone(r);
  assert.equal(buildRosterPlan(r, now).needs.length, 0);
  assert.deepEqual(
    r,
    before,
    'The strategy layer cannot mutate provider points or roster',
  );
});
void test('played bench players cannot cover a slot and a played FLEX stays fixed', () => {
  const r = report([
    player('starter', 'RB', { slot: 'RB:0' }),
    player('played', 'RB', { gameStatus: 'final', actual: 20, kickoff: 1 }),
  ]);
  assert.equal(buildRosterPlan(r, now).needs.length, 1);
  r.league.slots.push(slot('FLEX'));
  r.league.players[1].slot = 'FLEX:0';
  const plan = buildRosterPlan(r, now);
  assert.equal(plan.protected, 1);
  assert.equal(plan.open, 1);
  assert.equal(plan.needs[0].names[0], 'starter');
  assert.equal(r.league.players[1].actual, 20);
});
void test('uncertain locks suppress weekly coverage claims instead of inventing availability', () => {
  const r = report([
    player('starter', 'RB', { slot: 'RB:0' }),
    player('unknown', 'RB', { locked: null }),
  ]);
  const plan = buildRosterPlan(r, now);
  assert.equal(plan.weekly, false);
  assert.deepEqual(plan.needs, []);
});
void test('SUPERFLEX can use non-QB coverage, but two mandatory QBs cannot', () => {
  const q = player('QB1', 'QB', {
    slot: 'QB:0',
    eligible: ['QB', 'SUPERFLEX'],
  });
  const r = report(
    [
      q,
      player('QB2', 'QB', {
        slot: 'SUPERFLEX:0',
        eligible: ['QB', 'SUPERFLEX'],
      }),
      player('RB', 'RB', { eligible: ['SUPERFLEX'] }),
    ],
    [slot('QB'), slot('SUPERFLEX')],
  );
  assert.equal(buildRosterPlan(r, now).needs.length, 0);
  r.league.slots = [slot('QB'), slot('QB', 1)];
  r.league.players[1].slot = 'QB:1';
  assert.equal(buildRosterPlan(r, now).needs.length, 2);
});
void test('bye lookahead finds simultaneous gaps without copying current points or injuries into future weeks', () => {
  const r = report(
    [
      player('a', 'RB', { slot: 'RB:0', byeWeek: 3 }),
      player('b', 'WR', { slot: 'WR:0', byeWeek: 3 }),
      player('cover', 'RB', {
        eligible: ['RB', 'WR'],
        byeWeek: 4,
        projection: 0,
        injury: 'OUT',
      }),
    ],
    [slot('RB'), slot('WR')],
  );
  const bye = buildRosterPlan(r, now).byes.find((b) => b.week === 3);
  assert.equal(
    bye.missing.length,
    1,
    'One shared backup cannot cover both absences',
  );
  r.league.players.push(
    player('second', 'WR', {
      byeWeek: 4,
      locked: true,
      gameStatus: 'final',
      actual: 0,
    }),
  );
  assert.equal(
    buildRosterPlan(r, now).byes.find((b) => b.week === 3).missing.length,
    0,
  );
});
void test('an unknown bye cannot establish confirmed coverage and reserve players do not fill future slots', () => {
  const r = report([
    player('starter', 'RB', { slot: 'RB:0', byeWeek: 2 }),
    player('unknown', 'RB', { byeWeek: null }),
    player('taxi', 'RB', { taxi: true, byeWeek: 3 }),
  ]);
  const plan = buildRosterPlan(r, now);
  assert.equal(plan.byes[0].uncertain, true);
  assert.equal(plan.byeUnknown, 1);
  r.league.players = r.league.players.filter((p) => p.id !== 'unknown');
  assert.equal(buildRosterPlan(r, now).byes[0].missing.length, 1);
});
void test('pickup options require verified fresh ownership, timing and actual slot improvement', () => {
  const r = report(
    [player('starter', 'RB', { slot: 'RB:0' })],
    [slot('RB')],
    [
      player('good', 'RB'),
      player('wrong', 'WR', { eligible: ['WR'], projection: 99 }),
      player('late', 'RB', { waiverDate: now + 200000 }),
      player('locked', 'RB', { locked: true }),
    ],
  );
  assert.deepEqual(
    buildRosterPlan(r, now).needs[0].options.map((p) => p.id),
    ['good'],
  );
  r.ownershipVerified = false;
  assert.deepEqual(buildRosterPlan(r, now).needs[0].options, []);
  r.fetchedAt = new Date(now - 300001).toISOString();
  assert.equal(buildRosterPlan(r, now).weekly, false);
  assert.deepEqual(buildRosterPlan(r, now).needs, []);
  r.fetchedAt = new Date(now + 60001).toISOString();
  assert.equal(buildRosterPlan(r, now).weekly, false);
});
void test('noncurrent, best ball, special and unsupported IDP formats keep inventory without weekly recommendations', () => {
  for (const mutate of [
    (r) => {
      r.league.week = 2;
    },
    (r) => {
      r.league.status = 'pre_draft';
    },
    (r) => {
      r.league.rosterRules.bestBall = true;
    },
    (r) => {
      r.league.rosterRules.format = 'special';
    },
    (r) => {
      r.league.slots.push(slot('IDP'));
    },
  ]) {
    const r = report([player('a', 'RB', { slot: 'RB:0' })]);
    mutate(r);
    const plan = buildRosterPlan(r, now);
    assert.equal(plan.active, 1);
    assert.equal(plan.weekly, false);
    assert.equal(plan.needs.length, 0);
  }
});
void test('healthy starters without backups are contingencies rather than automatic pickup priorities', () => {
  const r = report(
    [player('kicker', 'K', { slot: 'K:0', eligible: ['K'] })],
    [slot('K')],
  );
  assert.equal(buildRosterPlan(r, now).needs[0].priority, 'contingency');
  r.league.players[0].injury = 'QUESTIONABLE';
  assert.equal(buildRosterPlan(r, now).needs[0].priority, 'immediate');
  r.league.players[0].injury = 'OUT';
  assert.equal(buildRosterPlan(r, now).needs[0].title, 'Cover 1 unfilled slot');
});
