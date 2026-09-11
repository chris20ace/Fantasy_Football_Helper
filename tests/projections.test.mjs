import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  historyWeeks,
  project,
  applyForecast,
  rankWaivers,
} from '../lib/fantasy/projections.ts';
import { scoreSleeper, scoreESPNGame } from '../lib/fantasy/scoring.ts';
const now = 1000;
const samples = (points) =>
  Array.from({ length: 8 }, (_, i) => ({ season: 2025, week: 18 - i, points }));
const player = (id, points, extra = {}) =>
  applyForecast(
    {
      id,
      key: id,
      name: id,
      position: 'RB',
      team: 'DET',
      eligible: ['RB'],
      slot: null,
      projection: points,
      partial: false,
      actual: null,
      injury: 'ACTIVE',
      bye: false,
      kickoff: 100000,
      opponent: 'CHI',
      locked: false,
      reserve: false,
      taxi: false,
      ...extra,
    },
    project(samples(points), 2026, 1, 1),
  );
const report = (players, candidates, extra = {}) => ({
  league: {
    id: 'sleeper:1',
    platform: 'sleeper',
    name: 'Test',
    teamName: 'Me',
    url: 'https://sleeper.com',
    status: 'in_season',
    week: 1,
    currentWeek: 1,
    season: 2026,
    fetchedAt: new Date(now).toISOString(),
    scoring: 'PPR',
    source: 'model',
    players,
    slots: [{ id: 'RB:0', key: 'RB', label: 'RB' }],
    standings: [],
    record: '0-0',
    actual: null,
    matchupProjection: null,
    opponent: null,
    warnings: [],
    ...extra,
  },
  candidates,
  historyThrough: '2025 week18',
  fetchedAt: new Date(now).toISOString(),
  evaluated: candidates.length,
  ownershipVerified: true,
  warnings: [],
  model: 'test',
});
void test('history cutoff crosses seasons and never includes selected or current week', () => {
  assert.deepEqual(historyWeeks(2026, 1, 1, 2), [
    { season: 2025, week: 18 },
    { season: 2025, week: 17 },
  ]);
  const f = project(
    [...samples(10), { season: 2026, week: 1, points: 999 }],
    2026,
    8,
    1,
  );
  assert.equal(f.points, 10);
  assert.equal(f.games, 8);
});
void test('requires three appearances, deduplicates games, and preserves negative and zero scores', () => {
  assert.equal(project([], 2026, 1, 1).points, null);
  assert.equal(project([samples(4)[0], samples(4)[0]], 2026, 1, 1).games, 1);
  assert.equal(project(samples(0), 2026, 1, 1).points, 0);
  assert.equal(project(samples(-2), 2026, 1, 1).points, -2);
  assert.equal(
    project(
      samples(4).map((g, i) => ({ ...g, partial: i === 0 })),
      2026,
      1,
      1,
    ).points,
    null,
  );
});
void test('scores nonlinear bonuses per actual game and honors explicit zero position overrides', () => {
  const rules = [
      { statId: 24, points: 0.1 },
      { statId: 37, points: 3 },
      { statId: 53, points: 1, pointsOverrides: { 2: 0, 4: 2 } },
    ],
    covered = new Set(['24', '37', '53']);
  assert.equal(
    scoreESPNGame({ 24: 110, 37: 1, 53: 5 }, rules, 2, covered).projection,
    14,
  );
  assert.equal(
    scoreESPNGame({ 24: 110, 37: 1, 53: 5 }, rules, 4, covered).projection,
    24,
  );
  assert.equal(
    scoreESPNGame({}, [{ statId: 9999, points: 5 }], 2, covered).partial,
    true,
  );
  assert.deepEqual(
    scoreESPNGame(
      {},
      [
        { statId: 63, points: 6 },
        { statId: 209, points: 1 },
      ],
      2,
      covered,
    ),
    { projection: 0, partial: false },
  );
  const f = project(
    samples(0).map((g, i) => ({
      ...g,
      points: scoreESPNGame(
        { 24: i % 2 ? 80 : 110, 37: i % 2 ? 0 : 1 },
        rules,
        2,
        covered,
      ).projection,
    })),
    2026,
    1,
    1,
  );
  assert.ok(f.points > 10 && f.points < 14);
});
void test('league scoring changes the best waiver pickup', () => {
  const score = (stats, ppr) =>
    scoreSleeper(stats, { rush_yd: 0.1, rec_yd: 0.1, rec: ppr }, 'RB')
      .projection;
  for (const ppr of [0, 1]) {
    const r = report(
      [player('starter', 4, { slot: 'RB:0' })],
      [
        player('runner', score({ rush_yd: 50 }, ppr)),
        player('receiver', score({ rush_yd: 10, rec: 4, rec_yd: 20 }, ppr)),
      ],
    );
    const best = rankWaivers(r, now)[0];
    assert.equal(best.player.id, ppr ? 'receiver' : 'runner');
    assert.equal(best.gain, ppr ? 3 : 1);
  }
});
void test('does not credit a pickup for an improvement already available on the bench', () => {
  const r = report(
    [player('starter', 5, { slot: 'RB:0' }), player('bench', 15)],
    [player('add', 12)],
  );
  assert.equal(rankWaivers(r, now)[0].gain, 0);
});
void test('waiver FLEX assignment is global and respects locked slots', () => {
  const r = report(
    [
      player('rb', 10, { slot: 'RB:0', eligible: ['RB', 'FLEX'] }),
      player('wr', 9, { slot: 'FLEX:1', eligible: ['FLEX'], position: 'WR' }),
    ],
    [player('add', 12, { eligible: ['FLEX'], position: 'WR' })],
    {
      slots: [
        { id: 'RB:0', key: 'RB', label: 'RB' },
        { id: 'FLEX:1', key: 'FLEX', label: 'FLEX' },
      ],
    },
  );
  assert.equal(rankWaivers(r, now)[0].gain, 3);
  r.league.players[1].locked = true;
  assert.equal(rankWaivers(r, now)[0].gain, 0);
});
void test('holds stale ownership, owned/locked/late-waiver candidates and unsupported history out of recommendations', () => {
  const r = report(
    [player('mine', 4, { slot: 'RB:0' })],
    [
      player('mine', 30),
      player('locked', 30, { locked: true }),
      player('unknown', 30, { locked: null }),
      { ...player('late', 30), waiverDate: 100001 },
      { ...player('missing', 30), projection: null, partial: true },
      player('ok', 8),
    ],
  );
  assert.deepEqual(
    rankWaivers(r, now).map((p) => p.player.id),
    ['ok'],
  );
  r.ownershipVerified = false;
  assert.deepEqual(rankWaivers(r, now), []);
  r.ownershipVerified = true;
  r.league.stale = true;
  assert.deepEqual(rankWaivers(r, now), []);
});
void test('missing healthy roster history prevents a numeric gain', () => {
  const r = report(
    [
      player('starter', 4, { slot: 'RB:0' }),
      { ...player('rookie', 1), projection: null, partial: true },
    ],
    [player('add', 10)],
  );
  assert.equal(rankWaivers(r, now)[0].gain, null);
});
