import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionDecisionKey,
  actionDecisionStatus,
} from '../lib/fantasy/action-decisions.ts';
import {
  updateActionDecisions,
  parseActionDecisionUpdate,
} from '../lib/accounts/preferences.ts';
import {
  buildLeagueCommand,
  comparePlanActions,
  moveTarget,
  starterTarget,
} from '../lib/fantasy/command-center.ts';
const now = 100000;
const slot = (key, i = 0) => ({ id: `${key}:${i}`, key, label: key });
const player = (id, pos, projection, extra = {}) => ({
  id,
  key: id,
  name: id,
  position: pos,
  team: 'DET',
  eligible: [pos, ...(['RB', 'WR', 'TE'].includes(pos) ? ['FLEX'] : [])],
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
const league = (id = 'sleeper:1') => ({
  id,
  platform: 'sleeper',
  name: id,
  teamName: 'Team',
  url: 'https://sleeper.com',
  status: 'in_season',
  week: 1,
  currentWeek: 1,
  season: 2026,
  fetchedAt: new Date(now).toISOString(),
  scoring: 'PPR',
  source: 'Provider',
  players: [player('QB', 'QB', 10, { slot: 'QB:0' })],
  slots: [slot('QB')],
  standings: [],
  record: '0-0',
  actual: 0,
  matchupProjection: null,
  opponent: null,
  warnings: [],
  rosterRules: {
    teams: 12,
    benchSlots: 0,
    irSlots: 0,
    taxiSlots: 0,
    format: 'redraft',
    bestBall: false,
    receptionPoints: 1,
    teReceptionBonus: 0,
  },
});
const entry = (l, candidates = []) => ({
  target: { id: l.id, week: l.week, season: l.season },
  phase: 'ready',
  report: {
    projectionSource: 'provider',
    league: l,
    fetchedAt: new Date(now).toISOString(),
    candidates,
    evaluated: candidates.length,
    warnings: [],
    ownershipVerified: true,
  },
  error: '',
});

test('review decisions survive routine projections, but changed players and new weeks return to the queue', () => {
  const l = league();
  l.players.push(player('better', 'QB', 20));
  l.rosterRules.benchSlots = 1;
  const action = buildLeagueCommand(l, entry(l), now).actions.find(
    (a) => a.kind === 'lineup',
  );
  const key = actionDecisionKey(action, l);
  const saved = updateActionDecisions(
    {},
    {
      key,
      fingerprint: action.fingerprint,
      status: 'acknowledged',
      revision: 0,
    },
    now,
  );
  assert.equal(actionDecisionStatus(action, l, saved), 'acknowledged');
  const refreshed = structuredClone(l);
  refreshed.fetchedAt = new Date(now + 1000).toISOString();
  refreshed.players.forEach((p) => {
    p.projection += 0.2;
  });
  const unchanged = buildLeagueCommand(
    refreshed,
    entry(refreshed),
    now + 1000,
  ).actions.find((a) => a.kind === 'lineup');
  assert.equal(unchanged.fingerprint, action.fingerprint);
  assert.equal(
    actionDecisionStatus(unchanged, refreshed, saved),
    'acknowledged',
  );
  refreshed.players[1] = player('different-backup', 'QB', 25);
  const changed = buildLeagueCommand(
    refreshed,
    entry(refreshed),
    now,
  ).actions.find((a) => a.kind === 'lineup');
  assert.equal(changed.id, action.id);
  assert.equal(actionDecisionStatus(changed, refreshed, saved), null);
  assert.equal(actionDecisionStatus(action, { ...l, week: 2 }, saved), null);
  assert.equal(
    actionDecisionStatus(action, { ...l, season: 2027 }, saved),
    null,
  );
  const otherLeague = { ...l, id: 'espn:1' };
  const other = buildLeagueCommand(
    otherLeague,
    entry(otherLeague),
    now,
  ).actions.find((a) => a.kind === 'lineup');
  assert.equal(actionDecisionStatus(other, otherLeague, saved), null);
});

test('dismissed injury and waiver advice resurfaces when the designation or add/drop changes', () => {
  const l = league();
  l.players[0].injury = 'QUESTIONABLE';
  l.players.push(player('backup', 'QB', 5));
  l.rosterRules.benchSlots = 1;
  const injury = buildLeagueCommand(l, entry(l), now).actions.find(
    (a) => a.kind === 'injury',
  );
  const decisions = updateActionDecisions(
    {},
    {
      key: actionDecisionKey(injury, l),
      fingerprint: injury.fingerprint,
      status: 'dismissed',
      revision: 0,
    },
    now,
  );
  l.players[0].injury = 'DOUBTFUL';
  const changedInjury = buildLeagueCommand(l, entry(l), now).actions.find(
    (a) => a.kind === 'injury',
  );
  assert.equal(actionDecisionStatus(changedInjury, l, decisions), null);
  l.players[0].injury = 'ACTIVE';
  const candidate = player('waiver-qb', 'QB', 25);
  const waiver = buildLeagueCommand(l, entry(l, [candidate]), now).actions.find(
    (a) => a.kind === 'waiver',
  );
  assert.ok(waiver);
  candidate.projection += 0.1;
  const same = buildLeagueCommand(
    l,
    entry(l, [candidate]),
    now + 1000,
  ).actions.find((a) => a.kind === 'waiver');
  assert.equal(same.fingerprint, waiver.fingerprint);
  l.players[1] = player('different-drop', 'QB', 5);
  const changedDrop = buildLeagueCommand(
    l,
    entry(l, [candidate]),
    now,
  ).actions.find((a) => a.kind === 'waiver');
  assert.notEqual(changedDrop.fingerprint, waiver.fingerprint);
});

test('restoring decisions is reversible and retained review history is bounded', () => {
  const update = {
    key: '2026:1:sleeper:1:lineup',
    fingerprint: '0123456789abcdef',
    status: 'dismissed',
    revision: 0,
  };
  const saved = updateActionDecisions({}, update, now);
  assert.equal(saved[update.key].status, 'dismissed');
  const restored = updateActionDecisions(
    saved,
    { ...update, status: null },
    now + 1,
  );
  assert.deepEqual(restored, {});
  assert.equal(saved[update.key].status, 'dismissed');
  let history = {};
  for (let i = 0; i < 300; i++)
    history = updateActionDecisions(
      history,
      { ...update, key: '2026:1:sleeper:1:action' + i },
      now + i,
    );
  assert.equal(Object.keys(history).length, 256);
  assert.ok(history['2026:1:sleeper:1:action299']);
  assert.equal(history['2026:1:sleeper:1:action0'], undefined);
});

test('action preference updates reject malformed statuses, scopes and revisions', () => {
  const update = {
    key: '2026:1:sleeper:1:lineup',
    fingerprint: '0123456789abcdef',
    status: 'acknowledged',
    revision: 2,
  };
  assert.deepEqual(parseActionDecisionUpdate(update), update);
  for (const patch of [
    { status: 'done' },
    { status: undefined },
    { key: '__proto__' },
    { key: '2026:19:sleeper:1' },
    { fingerprint: 'wrong' },
    { revision: -1 },
    { revision: 0.5 },
  ])
    assert.throws(() => parseActionDecisionUpdate({ ...update, ...patch }));
});
void test('ready, predraft, failed and loading leagues all have explicit command-center states', () => {
  const ready = league(),
    predraft = { ...league('sleeper:2'), status: 'pre_draft' },
    failed = { ...league('sleeper:3'), error: 'Reconnect ESPN' },
    loading = league('sleeper:4');
  const commands = [
    buildLeagueCommand(ready, entry(ready), now),
    buildLeagueCommand(predraft, entry(predraft), now),
    buildLeagueCommand(failed, undefined, now),
    buildLeagueCommand(loading, undefined, now),
  ];
  assert.deepEqual(
    commands.map((c) => c.status),
    ['ready', 'planning', 'attention', 'checking'],
  );
  assert.equal(commands[1].actions.length, 0);
  assert.equal(commands[2].actions[0].destination.view, 'sources');
  assert.equal(commands[3].complete, false);
});
void test('valid zeros and completed player scores never create false data or injury actions', () => {
  const l = league();
  l.players = [player('QB', 'QB', 0, { slot: 'QB:0' })];
  assert.equal(buildLeagueCommand(l, entry(l), now).actions.length, 0);
  l.players[0] = {
    ...l.players[0],
    actual: 0,
    gameStatus: 'final',
    injury: 'OUT',
    kickoff: 1,
  };
  assert.equal(buildLeagueCommand(l, entry(l), now).actions.length, 0);
  l.players[0].actual = null;
  const c = buildLeagueCommand(l, entry(l), now);
  assert.equal(c.scoresPending, true);
  assert.equal(c.status, 'scores');
  assert.equal(c.actions.length, 0);
});
void test('owned lineup rearrangements are one decision with exact league/section navigation', () => {
  const l = league();
  l.players.push(player('better', 'QB', 20));
  l.rosterRules.benchSlots = 1;
  const c = buildLeagueCommand(l, entry(l), now);
  const a = c.actions.filter((a) => a.kind === 'lineup');
  assert.equal(a.length, 1);
  assert.equal(a[0].gain, 10);
  assert.match(a[0].detail, /better/);
  assert.deepEqual(a[0].destination, {
    leagueId: l.id,
    view: 'lab',
    target: 'recommended-lineup',
  });
});
void test('all pickup alternatives survive grouping, including those outside the old top-three shortlist', () => {
  const l = league();
  l.players.push(player('bench', 'WR', 0));
  l.rosterRules.benchSlots = 1;
  const candidates = [2, 3, 4, 5, 8].map((byeWeek, i) =>
    player(`add${i}`, 'QB', 20 - i, { byeWeek }),
  );
  const c = buildLeagueCommand(l, entry(l, candidates), now);
  const decisions = c.actions.filter((a) => a.kind === 'waiver');
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].options.length, 5);
  for (const option of decisions[0].options) {
    assert.equal(option.destination.leagueId, l.id);
    assert.equal(option.destination.view, 'insights');
    assert.ok(option.destination.target.startsWith('waiver-move-'));
  }
  assert.equal(moveTarget('add4'), 'waiver-move-add4');
});
void test('same injured player in two leagues retains the correct owned fallback and target for each team', () => {
  const one = league(),
    two = league('sleeper:2');
  for (const [l, name] of [
    [one, 'Backup A'],
    [two, 'Backup B'],
  ]) {
    l.players = [
      player('QB', 'QB', 20, { slot: 'QB:0', injury: 'QUESTIONABLE' }),
      player(name, 'QB', 15),
    ];
    l.rosterRules.benchSlots = 1;
  }
  const a = buildLeagueCommand(one, entry(one), now).actions.find(
      (a) => a.kind === 'injury',
    ),
    b = buildLeagueCommand(two, entry(two), now).actions.find(
      (a) => a.kind === 'injury',
    );
  assert.match(a.detail, /Backup A/);
  assert.match(b.detail, /Backup B/);
  assert.notEqual(a.id, b.id);
  assert.equal(b.destination.target, starterTarget('QB'));
  assert.equal(b.destination.leagueId, two.id);
});
void test('Plan honors the same Keep choices as Waivers and does not propose a protected drop', () => {
  const l = league();
  l.players.push(player('bench', 'WR', 0));
  l.rosterRules.benchSlots = 1;
  const e = entry(l, [player('new', 'QB', 20)]);
  const c = buildLeagueCommand(l, e, now, false, ['QB', 'bench']);
  assert.ok(c.actions.every((a) => !a.options.length));
  assert.equal(c.plan.allMoves.length, 0);
});
void test('stale, failed and wrong-identity reports cannot produce actionable waiver comparisons', () => {
  const l = league();
  const e = entry(l, [player('new', 'QB', 20)]);
  for (const bad of [
    { ...e, phase: 'error', report: null, error: 'Failed' },
    { ...e, report: { ...e.report, league: { ...l, id: 'sleeper:9' } } },
    {
      ...e,
      report: { ...e.report, fetchedAt: new Date(now - 300001).toISOString() },
    },
  ]) {
    const c = buildLeagueCommand(l, bad, now);
    assert.equal(c.status, 'attention');
    assert.ok(c.actions.every((a) => a.kind !== 'waiver'));
  }
});
void test('unknown projections need a named check, while a past week stays in reference mode', () => {
  const l = league();
  l.players[0].projection = null;
  let c = buildLeagueCommand(l, entry(l), now);
  assert.ok(
    c.actions.some(
      (a) => a.kind === 'data' && a.destination.target === 'lineup-data-checks',
    ),
  );
  l.currentWeek = 2;
  c = buildLeagueCommand(l, entry(l), now);
  assert.equal(c.status, 'planning');
  assert.equal(c.actions.length, 0);
});
void test('failed scans suppress fallback lineup links and stale data always has an explanation', () => {
  const l = league();
  l.players.push(player('better', 'QB', 20));
  l.rosterRules.benchSlots = 1;
  const e = entry(l);
  assert.ok(
    buildLeagueCommand(l, undefined, now).actions.some(
      (a) => a.kind === 'lineup',
    ),
  );
  for (const bad of [
    { ...e, phase: 'error', report: null, error: 'Provider scan failed' },
    {
      ...e,
      report: { ...e.report, fetchedAt: new Date(now - 300001).toISOString() },
    },
    { ...e, report: { ...e.report, league: { ...l, stale: true } } },
    {
      ...e,
      report: { ...e.report, league: { ...l, error: 'Reconnect provider' } },
    },
  ]) {
    const c = buildLeagueCommand(l, bad, now);
    assert.equal(c.complete, false);
    assert.deepEqual(
      c.actions.map((a) => a.kind),
      ['connection'],
    );
    assert.ok(c.actions[0].detail.length > 0);
  }
});
void test('a pickup that covers one bye position cannot hide another uncovered position in the same week', () => {
  const l = league();
  l.slots.push(slot('TE'));
  l.players = [
    player('QB off', 'QB', 20, { slot: 'QB:0', byeWeek: 2 }),
    player('TE off', 'TE', 15, { slot: 'TE:0', byeWeek: 2 }),
  ];
  l.rosterRules.benchSlots = 1;
  const c = buildLeagueCommand(
    l,
    entry(l, [player('QB cover', 'QB', 10)]),
    now,
  );
  assert.ok(
    c.actions.some((a) => a.options.some((o) => o.name.includes('QB cover'))),
  );
  const gap = c.actions.find((a) => a.destination.target === 'roster-bye-2');
  assert.ok(gap);
  assert.match(gap.detail, /TE off/);
  assert.match(gap.detail, /2 starting slots/);
});
void test('urgent decisions precede optional gains across differently scored leagues', () => {
  const a = {
      id: 'one',
      priority: 1,
      optional: false,
      due: now + 500,
      gain: null,
    },
    b = { id: 'two', priority: 0, optional: true, due: now + 1, gain: 30 };
  assert.ok(comparePlanActions(a, b) < 0);
});
test('waiver depth-loss score updates preserve acknowledgement', () => {
  const l = league();
  l.players = [
    player('RB', 'RB', 10, { slot: 'RB:0' }),
    player('backup', 'RB', 7),
  ];
  l.slots = [slot('RB'), slot('WR')];
  l.rosterRules.benchSlots = 0;
  const candidate = player('newWR', 'WR', 12);
  const before = buildLeagueCommand(l, entry(l, [candidate]), now, false, [
    'RB',
  ]);
  const action = before.actions.find((a) => a.kind === 'waiver');
  const move = before.plan.allMoves[0];
  assert.equal(move.kind, 'repair');
  assert.equal(move.drop.id, 'backup');
  assert.equal(move.depthLoss.starter.id, 'RB');
  assert.equal(move.depthLoss.coverage, -1);
  const saved = updateActionDecisions(
    {},
    {
      key: actionDecisionKey(action, l),
      fingerprint: action.fingerprint,
      status: 'acknowledged',
      revision: 0,
    },
    now,
  );
  const refreshed = structuredClone(l);
  refreshed.players.forEach((p) => {
    p.projection += 0.2;
  });
  refreshed.fetchedAt = new Date(now + 1000).toISOString();
  const after = buildLeagueCommand(
    refreshed,
    entry(refreshed, [{ ...candidate, projection: 12.2 }]),
    now + 1000,
    false,
    ['RB'],
  );
  const next = after.actions.find((a) => a.kind === 'waiver');
  assert.notEqual(after.plan.allMoves[0].depthLoss.gain, move.depthLoss.gain);
  assert.equal(next.fingerprint, action.fingerprint);
  assert.equal(actionDecisionStatus(next, refreshed, saved), 'acknowledged');
});
