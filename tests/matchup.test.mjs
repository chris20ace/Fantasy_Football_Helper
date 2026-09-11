import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMatchup } from '../lib/fantasy/matchup.ts';
const now = Date.parse('2026-09-11T12:00:00Z');
const player = (id, points, slot = null, extra = {}) => ({
  id,
  key: id,
  name: id,
  position: 'RB',
  team: 'DET',
  eligible: ['RB', 'FLEX'],
  slot,
  projection: points,
  actual: 0,
  partial: false,
  injury: 'ACTIVE',
  bye: false,
  kickoff: now + 100000,
  opponent: 'CHI',
  locked: false,
  reserve: false,
  taxi: false,
  ...extra,
});
const report = () => ({
  fetchedAt: new Date(now).toISOString(),
  candidates: [],
  projectionSource: 'provider',
  ownershipVerified: true,
  league: {
    id: 'sleeper:1',
    platform: 'sleeper',
    name: 'League',
    teamName: 'Us',
    url: 'https://sleeper.com',
    week: 1,
    currentWeek: 1,
    season: 2026,
    status: 'in_season',
    fetchedAt: new Date(now).toISOString(),
    slots: [
      { id: 'RB:0', key: 'RB', label: 'RB' },
      { id: 'FLEX:1', key: 'FLEX', label: 'FLEX' },
    ],
    players: [
      player('a', 10, 'RB:0'),
      player('b', 8, 'FLEX:1'),
      player('c', 15),
    ],
    actual: 60,
    matchupProjection: 190,
    warnings: [],
    opponent: {
      id: '2',
      name: 'Them',
      actual: 50,
      projection: 180,
      rosterVerified: true,
      players: [player('d', 12, 'RB:0'), player('e', 9, 'FLEX:1')],
    },
  },
});
void test('native provider points choose and score the recommended lineup for both teams', () => {
  const r = report();
  for (const p of [...r.league.players, ...r.league.opponent.players])
    p.projection = 20;
  r.league.players[1].projection = 100;
  const m = analyzeMatchup(r, now);
  assert.equal(m.submitted, 120);
  assert.equal(m.opposing, 40);
  assert.equal(m.suggested, 120);
  assert.equal(m.submittedEdge, 80);
  assert.equal(m.suggestedEdge, 80);
  assert.ok(m.rows.some((r) => r.suggested?.id === 'b'));
  r.league.opponent.players[0].partial = true;
  assert.equal(analyzeMatchup(r, now).opposing, null);
  r.league.opponent.players[0].partial = false;
  r.league.opponent.players[0].projection = null;
  assert.equal(analyzeMatchup(r, now).opposing, null);
});
void test('compares submitted starters and achievable recommended lineup without mixing live points', () => {
  const r = report(),
    before = JSON.stringify(r),
    m = analyzeMatchup(r, now);
  assert.equal(m.submitted, 18);
  assert.equal(m.opposing, 21);
  assert.equal(m.suggested, 25);
  assert.equal(m.submittedEdge, -3);
  assert.equal(m.suggestedEdge, 4);
  assert.equal(m.liveEdge, 10);
  assert.equal(m.weakest.label, 'RB');
  assert.equal(m.threats[0].id, 'd');
  assert.equal(
    JSON.stringify(r),
    before,
    'Analysis must not mutate owned or opposing rosters',
  );
});
void test('holds locked FLEX and excludes locked bench from achievable scenario', () => {
  const r = report();
  r.league.players[1].locked = true;
  r.league.players[2].locked = true;
  const m = analyzeMatchup(r, now);
  assert.equal(m.suggested, 18);
  assert.equal(m.rows[1].suggested.id, 'b');
});
void test('unknown estimates and empty slots withhold totals but retain evidenced position comparisons', () => {
  const r = report();
  r.league.opponent.players[0].projection = null;
  let m = analyzeMatchup(r, now);
  assert.equal(m.opposing, null);
  assert.equal(m.submittedEdge, null);
  assert.equal(m.suggestedEdge, null);
  assert.equal(m.groups.find((g) => g.label === 'RB').edge, null);
  assert.equal(m.groups.find((g) => g.label === 'FLEX').edge, -1);
  assert.equal(m.coverage.theirs, 1);
  r.league.opponent.players = [];
  m = analyzeMatchup(r, now);
  assert.equal(m.opposing, null);
  assert.equal(m.threats.length, 0);
});
void test('zero and negative estimates remain valid; non-finite estimates do not', () => {
  const r = report();
  r.league.players[0].projection = 0;
  r.league.players[1].projection = -2;
  r.league.opponent.players[0].projection = 0;
  r.league.opponent.players[1].projection = -4;
  assert.equal(analyzeMatchup(r, now).submittedEdge, 2);
  r.league.opponent.players[0].projection = NaN;
  assert.equal(analyzeMatchup(r, now).opposing, null);
});
void test('duplicate IDs, duplicate slots, invalid IDs and ineligible assignments cannot yield matchup edges', () => {
  for (const corrupt of [
    (r) => r.league.opponent.players.push({ ...r.league.opponent.players[0] }),
    (r) => (r.league.opponent.players[0].slot = 'FLEX:1'),
    (r) => (r.league.opponent.players[0].id = ''),
    (r) => (r.league.opponent.players[0].eligible = ['QB']),
    (r) => (r.league.players[0].eligible = ['QB']),
  ]) {
    const r = report();
    corrupt(r);
    const m = analyzeMatchup(r, now);
    assert.equal(m.available, false);
    assert.equal(m.submittedEdge, null);
  }
});
void test('stale, invalid timestamps, future snapshots and other weeks pause projected comparisons', () => {
  for (const change of [
    (r) => (r.league.stale = true),
    (r) => (r.league.error = 'Unavailable'),
    (r) => (r.fetchedAt = new Date(now - 300001).toISOString()),
    (r) => (r.fetchedAt = 'invalid'),
    (r) => (r.fetchedAt = new Date(now + 120000).toISOString()),
    (r) => (r.league.week = 2),
    (r) => (r.league.currentWeek = 2),
    (r) => (r.league.status = 'pre_draft'),
  ]) {
    const r = report();
    change(r);
    const m = analyzeMatchup(r, now);
    assert.equal(m.available, false);
    assert.equal(m.suggestedEdge, null);
    assert.equal(m.threats.length, 0);
  }
});
void test('old caches and missing or unverified opponents do not fabricate a comparison', () => {
  const r = report();
  delete r.league.opponent.players;
  assert.equal(analyzeMatchup(r, now).available, false);
  r.league.opponent = null;
  assert.match(analyzeMatchup(r, now).reason, /No head-to-head opponent/);
});
void test('started counts do not infer finished games or use bench kickoff times', () => {
  const r = report();
  r.league.players[0].kickoff = now - 1000;
  r.league.opponent.players[0].kickoff = null;
  const m = analyzeMatchup(r, now);
  assert.deepEqual(m.notStarted, { mine: 1, theirs: 1 });
  assert.equal(m.submitted, 18);
  assert.equal('finished' in m, false);
});
