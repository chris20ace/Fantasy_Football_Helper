import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playerPoints,
  gameLabel,
  scoreProgress,
} from '../lib/fantasy/points.ts';
import { gameStatuses } from '../lib/fantasy/game-status.ts';
import { analyze, total } from '../lib/fantasy/analysis.ts';
import { rankWaivers } from '../lib/fantasy/projections.ts';
const now = 1000;
const player = (extra = {}) => ({
  id: 'one',
  key: 'one',
  name: 'One',
  position: 'RB',
  team: 'DET',
  eligible: ['RB', 'FLEX'],
  slot: 'FLEX:1',
  projection: 20,
  actual: 0,
  partial: false,
  injury: 'ACTIVE',
  bye: false,
  kickoff: 2000,
  gameStatus: 'scheduled',
  locked: false,
  reserve: false,
  taxi: false,
  opponent: 'CHI',
  ...extra,
});
void test('upcoming provider-locked players retain projections despite pregame actual zeroes', () => {
  const p = player({ locked: true });
  assert.deepEqual(playerPoints(p, now), {
    value: 20,
    basis: 'projection',
    label: 'Proj.',
  });
  assert.equal(total([p], now), 20);
});
void test('played players replace projections with actuals including zero and negative points', () => {
  for (const actual of [0, -2, 6]) {
    const p = player({
      gameStatus: 'final',
      kickoff: 500,
      actual,
      projection: null,
      partial: true,
    });
    assert.equal(playerPoints(p, now).value, actual);
    assert.equal(playerPoints(p, now).label, 'Final');
    assert.equal(total([p, player()], now), actual + 20);
  }
  const live = player({ gameStatus: 'live', kickoff: 500, actual: 6 });
  assert.equal(total([live], now), 6);
  assert.equal(playerPoints(live, now).label, 'Live');
});
void test('missing actuals stay pending without restoring projections or guessing a final', () => {
  for (const actual of [null, NaN, Infinity]) {
    const p = player({ gameStatus: 'final', actual });
    assert.equal(playerPoints(p, now).value, null);
    assert.equal(total([p], now), null);
  }
  const unknown = player({ gameStatus: 'unknown', kickoff: 500, actual: 6 });
  assert.equal(playerPoints(unknown, now).basis, 'pending');
  assert.equal(gameLabel(unknown, now), 'Game status unconfirmed');
  assert.equal(
    playerPoints(player({ gameStatus: 'delayed', kickoff: 500 }), now).basis,
    'projection',
  );
  for (const gameStatus of ['canceled', 'postponed'])
    assert.equal(playerPoints(player({ gameStatus }), now).value, null);
});
void test('finished FLEX stays pinned while gains and completeness use actuals plus upcoming estimates', () => {
  const l = {
    status: 'in_season',
    week: 1,
    currentWeek: 1,
    slots: [
      { id: 'RB:0', key: 'RB', label: 'RB' },
      { id: 'FLEX:1', key: 'FLEX', label: 'FLEX' },
    ],
    players: [
      player({
        gameStatus: 'final',
        actual: 4,
        projection: null,
        partial: true,
        kickoff: 500,
      }),
      player({ id: 'two', slot: 'RB:0', projection: 8 }),
      player({ id: 'bench', slot: null, projection: 12 }),
      player({
        id: 'played-bench',
        slot: null,
        gameStatus: 'final',
        actual: 50,
        projection: null,
        kickoff: 500,
      }),
    ],
  };
  const result = analyze(l, now);
  assert.equal(result.currentTotal, 12);
  assert.equal(result.recommendedTotal, 16);
  assert.equal(result.gain, 4);
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.assignments.map((a) => a.recommended.id),
    ['bench', 'one'],
  );
  assert.deepEqual(scoreProgress(l.players.slice(0, 2), now), {
    final: 1,
    live: 0,
    upcoming: 1,
    pending: 0,
    allFinal: false,
  });
});
const event = (id, name, state, completed = false) => ({
  id,
  season: { year: 2026, type: 2 },
  week: { number: 1 },
  status: { type: { name, state, completed } },
  competitions: [
    {
      id,
      competitors: [
        { homeAway: 'home', team: { id: '1' } },
        { homeAway: 'away', team: { id: '2' } },
      ],
    },
  ],
});
const board = (events) => ({
  season: { year: 2026, type: 2 },
  week: { number: 1 },
  events,
});
void test('game status requires exact season/week identity and explicit final evidence', () => {
  const events = [
    event('10', 'STATUS_FINAL', 'post', true),
    event('11', 'STATUS_IN_PROGRESS', 'in'),
    event('12', 'STATUS_SCHEDULED', 'pre'),
    event('13', 'STATUS_CANCELED', 'post'),
    event('14', 'STATUS_DELAYED', 'pre'),
    event('15', 'STATUS_DELAYED', 'in'),
  ];
  assert.deepEqual(
    Object.values(gameStatuses(board(events), 2026, 1)).map((s) => s.status),
    ['final', 'live', 'scheduled', 'canceled', 'delayed', 'live'],
  );
  assert.deepEqual(gameStatuses(board(events), 2025, 1), {});
  assert.deepEqual(gameStatuses(board(events), 2026, 2), {});
  assert.equal(
    gameStatuses(board([event('10', 'STATUS_FINAL', 'post', false)]), 2026, 1)[
      '10'
    ].status,
    'unknown',
  );
  assert.deepEqual(gameStatuses(board([events[0], events[0]]), 2026, 1), {});
  const bad = structuredClone(events[0]);
  bad.competitions[0].competitors[1].team.id = '1';
  assert.deepEqual(gameStatuses(board([bad]), 2026, 1), {});
});
void test('canceled, postponed and unconfirmed candidates cannot displace an available starter or win a waiver recommendation', () => {
  const l = {
    status: 'in_season',
    week: 1,
    currentWeek: 1,
    slots: [{ id: 'FLEX:1', key: 'FLEX', label: 'FLEX' }],
    players: [
      player({ projection: 15 }),
      player({
        id: 'canceled',
        slot: null,
        projection: 30,
        gameStatus: 'canceled',
      }),
      player({
        id: 'postponed',
        slot: null,
        projection: 40,
        gameStatus: 'postponed',
      }),
      player({
        id: 'unknown',
        slot: null,
        projection: 50,
        gameStatus: 'unknown',
        kickoff: null,
      }),
    ],
  };
  assert.equal(analyze(l, now).assignments[0].recommended.id, 'one');
  const report = {
    projectionSource: 'provider',
    league: { ...l, players: [l.players[0]] },
    candidates: [
      ...l.players.slice(1),
      player({ id: 'available', slot: null, projection: 16 }),
    ],
    ownershipVerified: true,
    fetchedAt: new Date(now).toISOString(),
  };
  assert.deepEqual(
    rankWaivers(report, now).map((p) => p.player.id),
    ['available'],
  );
  l.players[0].gameStatus = 'canceled';
  l.players.push(player({ id: 'replacement', slot: null, projection: 12 }));
  assert.equal(analyze(l, now).assignments[0].recommended.id, 'replacement');
  assert.equal(analyze(l, now).issues[0].reason, 'Game canceled');
});
