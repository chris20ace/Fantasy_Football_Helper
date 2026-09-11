import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, exposure } from '../lib/fantasy/analysis.ts';
const now = 1000;
const player = (id, projection, eligible, extra = {}) => ({
  id,
  key: `espn:${id}`,
  name: id,
  position: 'RB',
  team: 'DET',
  eligible,
  slot: null,
  projection,
  partial: false,
  actual: null,
  injury: 'ACTIVE',
  bye: false,
  kickoff: 100000,
  opponent: 'vs CHI',
  locked: false,
  reserve: false,
  taxi: false,
  ...extra,
});
const league = (players, keys = ['RB'], extra = {}) => ({
  id: 'test',
  platform: 'espn',
  name: 'Test',
  teamName: 'My team',
  url: 'https://example.com',
  status: 'in_season',
  week: 1,
  currentWeek: 1,
  season: 2026,
  fetchedAt: '2026-09-10T12:00:00Z',
  scoring: 'PPR',
  source: 'Test projections',
  players,
  slots: keys.map((key, i) => ({ id: `${key}:${i}`, key, label: key })),
  standings: [],
  record: '0–0',
  actual: null,
  matchupProjection: null,
  opponent: null,
  warnings: [],
  ...extra,
});
void test('solves the superflex greedy trap globally without using a player twice', () => {
  const l = league(
    [
      player('QB1', 25, ['QB', 'SF'], { slot: 'QB:0' }),
      player('QB2', 23, ['QB', 'SF'], { slot: 'SF:1' }),
      player('RB', 24, ['SF']),
    ],
    ['QB', 'SF'],
  );
  const a = analyze(l, now);
  assert.equal(a.recommendedTotal, 49);
  assert.deepEqual(
    a.assignments.map((r) => r.recommended.id),
    ['QB1', 'RB'],
  );
});
void test('keeps a locked FLEX player in the exact slot and excludes locked bench', () => {
  const l = league(
    [
      player('held', 10, ['RB', 'FLEX'], { slot: 'FLEX:1', locked: true }),
      player('current', 8, ['RB', 'FLEX'], { slot: 'RB:0' }),
      player('started', 40, ['RB', 'FLEX'], { kickoff: 500 }),
      player('bench', 12, ['RB', 'FLEX']),
    ],
    ['RB', 'FLEX'],
  );
  const a = analyze(l, now);
  assert.equal(a.recommendedTotal, 22);
  assert.equal(a.assignments[1].recommended.id, 'held');
  assert.equal(a.assignments[0].recommended.id, 'bench');
});
void test('replaces an OUT starter with missing projection but does not invent a gain', () => {
  const a = analyze(
    league([
      player('out', null, ['RB'], { slot: 'RB:0', injury: 'OUT' }),
      player('healthy', 12, ['RB']),
    ]),
    now,
  );
  assert.equal(a.assignments[0].recommended.id, 'healthy');
  assert.equal(a.gain, null);
  assert.equal(a.assignments[0].locked, false);
});
void test('excludes IR, taxi, bye and OUT even with positive projections', () => {
  const a = analyze(
    league([
      player('healthy', 9, ['RB'], { slot: 'RB:0' }),
      player('ir', 50, ['RB'], { reserve: true }),
      player('taxi', 60, ['RB'], { taxi: true }),
      player('bye', 70, ['RB'], { bye: true }),
      player('out', 80, ['RB'], { injury: 'OUT' }),
    ]),
    now,
  );
  assert.equal(a.recommendedTotal, 9);
});
void test('distinguishes missing, zero and negative projections', () => {
  const a = analyze(
    league([
      player('negative', -2, ['RB'], { slot: 'RB:0' }),
      player('zero', 0, ['RB']),
      player('missing', null, ['RB']),
    ]),
    now,
  );
  assert.equal(a.recommendedTotal, 0);
  assert.equal(a.changes[0].id, 'zero');
  assert.equal(a.complete, false);
});
void test('holds a healthy starter with missing projection without claiming a game lock', () => {
  const a = analyze(
    league([
      player('missing', null, ['RB'], { slot: 'RB:0' }),
      player('bench', 50, ['RB']),
    ]),
    now,
  );
  assert.equal(a.assignments[0].recommended.id, 'missing');
  assert.equal(a.assignments[0].locked, false);
  assert.equal(a.recommendedTotal, null);
});
void test('unknown locks suppress complete claim and keep starter fixed', () => {
  const a = analyze(
    league([
      player('uncertain', 5, ['RB'], { slot: 'RB:0', locked: null }),
      player('bench', 20, ['RB']),
    ]),
    now,
  );
  assert.equal(a.assignments[0].recommended.id, 'uncertain');
  assert.equal(a.complete, false);
});
void test('pre-draft, stale, past and future weeks do not offer actionable advice', () => {
  for (const extra of [
    { status: 'pre_draft' },
    { stale: true },
    { week: 2 },
    { currentWeek: 2 },
  ]) {
    const a = analyze(
      league(
        [
          player('starter', 2, ['RB'], { slot: 'RB:0' }),
          player('bench', 20, ['RB']),
        ],
        ['RB'],
        extra,
      ),
      now,
    );
    assert.equal(a.enabled, false);
    assert.equal(a.changes.length, 0);
    assert.equal(a.gain, null);
  }
});
void test('fills repeated FLEX slots with distinct eligible players', () => {
  const l = league(
    [
      player('one', 10, ['FLEX']),
      player('two', 9, ['FLEX']),
      player('three', 8, ['FLEX']),
    ],
    ['FLEX', 'FLEX'],
  );
  const a = analyze(l, now);
  assert.equal(a.recommendedTotal, 19);
  assert.equal(new Set(a.assignments.map((r) => r.recommended.id)).size, 2);
});
void test('exposure uses latest fresh injury observation independent of league order', () => {
  const old = league([player('same', 10, ['RB'], { injury: 'OUT' })], ['RB'], {
    id: 'old',
    stale: true,
  });
  const fresh = league([player('same', 10, ['RB'])], ['RB'], {
    id: 'fresh',
    fetchedAt: '2026-09-10T13:00:00Z',
  });
  for (const list of [
    [old, fresh],
    [fresh, old],
  ]) {
    const result = exposure(list);
    assert.equal(result.length, 1);
    assert.equal(result[0].injury, 'ACTIVE');
    assert.equal(result[0].leagues.length, 2);
  }
});
