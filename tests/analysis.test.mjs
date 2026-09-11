import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, exposure } from '../lib/fantasy/analysis.ts';
import { applySleeperAutoSubLocks } from '../lib/fantasy/autosubs.ts';
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

void test('a missing bench projection names the bench player without claiming starter scores are missing', () => {
  const a = analyze(
    league(
      [
        player('starter', 18, ['QB'], { slot: 'QB:0', position: 'QB' }),
        player('Fernando Mendoza', null, ['QB'], { position: 'QB' }),
      ],
      ['QB'],
      { platform: 'sleeper' },
    ),
    now,
  );
  assert.deepEqual(a.coverage, { starterScores: 1, starterSlots: 1 });
  assert.equal(a.currentTotal, 18);
  assert.equal(a.complete, false);
  assert.equal(
    a.gain,
    null,
    'An unevaluated alternative cannot establish zero possible gain',
  );
  assert.deepEqual(
    a.review.map((r) => [r.player.name, r.slot, r.kind]),
    [['Fernando Mendoza', 'Bench', 'projection']],
  );
  assert.match(a.reasons[0], /Fernando Mendoza · Bench.*Sleeper/);
});

void test('confirmed played scores override raw null locks and obsolete missing projections', () => {
  for (const gameStatus of ['final', 'live']) {
    const a = analyze(
      league([
        player('played', null, ['RB'], {
          slot: 'RB:0',
          gameStatus,
          actual: 0,
          locked: null,
          partial: true,
        }),
        player('played bench', null, ['RB'], {
          gameStatus,
          actual: 30,
          locked: null,
        }),
        player('unprojected bench', null, ['RB']),
      ]),
      now,
    );
    assert.equal(a.complete, true, 'No bench player can enter the played slot');
    assert.equal(a.currentTotal, 0);
    assert.equal(a.assignments[0].recommended.id, 'played');
    assert.deepEqual(a.review, []);
    assert.deepEqual(a.reasons, []);
  }
});

void test('pending actuals and unconfirmed game status are named instead of being called missing projections', () => {
  for (const gameStatus of ['final', 'live']) {
    const a = analyze(
      league([
        player('score pending', 25, ['RB'], {
          slot: 'RB:0',
          gameStatus,
          actual: null,
          locked: null,
        }),
      ]),
      now,
    );
    assert.equal(a.currentTotal, null);
    assert.equal(a.complete, false);
    assert.deepEqual(
      a.review.map((r) => [r.player.name, r.kind]),
      [['score pending', 'actual']],
    );
    assert.equal(a.assignments[0].locked, true);
    assert.match(a.reasons[0], /points are pending/);
  }
  const a = analyze(
    league([
      player('status pending', 25, ['RB'], {
        slot: 'RB:0',
        gameStatus: 'unknown',
        kickoff: null,
        locked: null,
      }),
    ]),
    now,
  );
  assert.ok(a.review.some((r) => r.kind === 'game-status'));
  assert.ok(!a.review.some((r) => r.kind === 'projection'));
});

void test('a played FLEX narrows AutoSub checks without freezing QB, kicker, or defense', () => {
  const players = [
    player('Davante Adams', null, ['WR', 'FLEX'], {
      position: 'WR',
      slot: 'FLEX:0',
      gameStatus: 'final',
      kickoff: 500,
      actual: 5.6,
      locked: true,
    }),
    player('Dak Prescott', 17.3, ['QB'], { position: 'QB', slot: 'QB:1' }),
    player('Jared Goff', 18.8, ['QB'], { position: 'QB' }),
    player('Fernando Mendoza', null, ['QB'], { position: 'QB' }),
    player('kicker', 7, ['K'], { position: 'K', slot: 'K:2' }),
    player('defense', 8.5, ['DEF'], { position: 'DEF', slot: 'DEF:3' }),
    player('RB starter', 14, ['RB', 'FLEX'], { slot: 'RB:4' }),
    player('RB bench', 20, ['RB', 'FLEX']),
    player('IR', null, ['WR', 'FLEX'], { reserve: true }),
  ];
  const before = JSON.stringify(players);
  const normalized = applySleeperAutoSubLocks(players, now);
  assert.equal(
    JSON.stringify(players),
    before,
    'The AutoSub gate must not mutate provider input',
  );
  for (const name of [
    'Dak Prescott',
    'Jared Goff',
    'Fernando Mendoza',
    'kicker',
    'defense',
  ])
    assert.equal(normalized.find((p) => p.id === name).locked, false, name);
  for (const name of ['RB starter', 'RB bench']) {
    assert.equal(normalized.find((p) => p.id === name).locked, null, name);
    assert.match(
      normalized.find((p) => p.id === name).lockReason,
      /Davante Adams/,
    );
  }
  const a = analyze(
    league(normalized, ['FLEX', 'QB', 'K', 'DEF', 'RB'], {
      platform: 'sleeper',
    }),
    now,
  );
  assert.equal(a.assignments[0].recommended.id, 'Davante Adams');
  assert.equal(a.assignments[0].recommended.actual, 5.6);
  assert.equal(a.assignments[1].recommended.id, 'Jared Goff');
  assert.equal(a.assignments[4].recommended.id, 'RB starter');
  assert.deepEqual(a.coverage, { starterScores: 5, starterSlots: 5 });
  assert.equal(a.gain, null);
  assert.deepEqual(
    a.review.filter((r) => r.kind === 'projection').map((r) => r.player.id),
    ['Fernando Mendoza'],
  );
  assert.ok(!a.review.some((r) => r.player.id === 'Davante Adams'));
});

void test('AutoSub checks consider all eligible slots and stay conservative for unknown eligibility and superflex', () => {
  const played = player('played', 5, ['WR', 'FLEX', 'SUPER_FLEX'], {
    position: 'WR',
    slot: 'WR:0',
    gameStatus: 'final',
    locked: true,
  });
  const qb = player('QB', 20, ['QB', 'SUPER_FLEX'], { position: 'QB' });
  assert.equal(applySleeperAutoSubLocks([played, qb], now)[1].locked, null);
  const missing = { ...played, eligible: [], position: '—' };
  assert.equal(applySleeperAutoSubLocks([missing, qb], now)[1].locked, null);
  assert.equal(
    applySleeperAutoSubLocks([{ ...played, reserve: true }, qb], now)[1].locked,
    false,
  );
  assert.equal(
    applySleeperAutoSubLocks([{ ...played, taxi: true }, qb], now)[1].locked,
    false,
  );
  const beforeKickoff = { ...played, gameStatus: 'scheduled', locked: false };
  assert.equal(
    applySleeperAutoSubLocks([beforeKickoff, qb], now)[1].locked,
    false,
  );
});

void test('AutoSub eligibility is rechecked when kickoff passes inside a fresh snapshot', () => {
  const l = league(
    [
      player('early', 5, ['RB', 'FLEX'], {
        slot: 'RB:0',
        kickoff: 1000,
        gameStatus: 'scheduled',
      }),
      player('later starter', 8, ['RB', 'FLEX'], {
        slot: 'FLEX:1',
        kickoff: 2000,
      }),
      player('later bench', 20, ['RB', 'FLEX'], { kickoff: 2000 }),
    ],
    ['RB', 'FLEX'],
    { autoSubs: true, platform: 'sleeper' },
  );
  assert.ok(analyze(l, 900).changes.some((p) => p.id === 'later bench'));
  const after = analyze(l, 1100);
  assert.equal(after.assignments[0].recommended.id, 'early');
  assert.equal(after.assignments[1].recommended.id, 'later starter');
  assert.equal(after.review.filter((r) => r.kind === 'lock').length, 2);
  assert.equal(after.gain, null);
  assert.equal(
    l.players[1].locked,
    false,
    'Analysis does not mutate the snapshot',
  );
});

void test('a provider-locked upcoming starter still gets a named missing-projection check', () => {
  const a = analyze(
    league([
      player('locked starter', null, ['RB'], {
        slot: 'RB:0',
        locked: true,
        gameStatus: 'scheduled',
      }),
    ]),
    now,
  );
  assert.equal(a.currentTotal, null);
  assert.equal(a.assignments[0].locked, true);
  assert.deepEqual(
    a.review.map((r) => [r.player.name, r.kind]),
    [['locked starter', 'projection']],
  );
});
