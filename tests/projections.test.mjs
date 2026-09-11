import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankWaivers } from '../lib/fantasy/projections.ts';
import { analyze } from '../lib/fantasy/analysis.ts';
import { scoreSleeper } from '../lib/fantasy/scoring.ts';
const now = 1000;
const player = (id, points, extra = {}) => ({
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
});
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
    source: 'Sleeper projections',
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
  fetchedAt: new Date(now).toISOString(),
  evaluated: candidates.length,
  ownershipVerified: true,
  warnings: [],
  projectionSource: 'provider',
});
void test('waivers can improve an upcoming FLEX while a played WR stays fixed', () => {
  const played = player('played WR', null, {
    position: 'WR',
    eligible: ['WR', 'FLEX'],
    slot: 'WR:0',
    gameStatus: 'final',
    actual: 5.6,
    kickoff: 500,
  });
  const candidate = player('available RB', 15, { eligible: ['RB', 'FLEX'] });
  const r = report([played], [candidate], {
    slots: [
      { id: 'WR:0', key: 'WR', label: 'WR' },
      { id: 'FLEX:1', key: 'FLEX', label: 'FLEX' },
    ],
  });
  assert.equal(rankWaivers(r, now)[0].fills, 'FLEX');
  r.league.players.push(
    player('owned FLEX', 8, { eligible: ['RB', 'FLEX'], slot: 'FLEX:1' }),
  );
  const pick = rankWaivers(r, now)[0];
  assert.equal(pick.fills, 'FLEX');
  assert.equal(pick.gain, 7);
  assert.equal(
    analyze({ ...r.league, players: [...r.league.players, candidate] }, now)
      .assignments[0].recommended.id,
    played.id,
  );
});
void test('CeeDee Lamb stays ahead of Dalton Schultz using provider projections without any history', () => {
  const r = report(
    [
      player('lamb', 21.4, {
        name: 'CeeDee Lamb',
        position: 'WR',
        eligible: ['FLEX'],
        slot: 'FLEX:0',
      }),
      player('schultz', 8.2, {
        name: 'Dalton Schultz',
        position: 'TE',
        eligible: ['FLEX'],
      }),
    ],
    [],
    { slots: [{ id: 'FLEX:0', key: 'FLEX', label: 'FLEX' }] },
  );
  const result = analyze(r.league, now);
  assert.equal(result.assignments[0].recommended.id, 'lamb');
  assert.equal(result.currentTotal, 21.4);
  assert.equal(result.gain, 0);
  r.league.players[0].slot = null;
  r.league.players[1].slot = 'FLEX:0';
  assert.equal(analyze(r.league, now).assignments[0].recommended.id, 'lamb');
});
void test('rookies with provider projections can be recommended with no history or role model', () => {
  const r = report(
    [player('starter', 5, { slot: 'RB:0' })],
    [player('rookie', 12)],
  );
  assert.equal(rankWaivers(r, now)[0].gain, 7);
  delete r.projectionSource;
  assert.deepEqual(
    rankWaivers(r, now),
    [],
    'Old report schemas cannot supply recommendations',
  );
});
void test('league scoring changes the best waiver pickup', () => {
  const score = (stats, ppr) =>
    scoreSleeper(stats, { rush_yd: 0.1, rec_yd: 0.1, rec: ppr }, 1).projection;
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
void test('holds stale ownership, owned/locked/late-waiver candidates and unsupported projections out of recommendations', () => {
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
void test('missing healthy roster projections prevents a numeric gain', () => {
  const r = report(
    [
      player('starter', 4, { slot: 'RB:0' }),
      { ...player('rookie', 1), projection: null, partial: true },
    ],
    [player('add', 10)],
  );
  assert.equal(rankWaivers(r, now)[0].gain, null);
});
