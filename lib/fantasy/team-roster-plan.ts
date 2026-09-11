import { analyze, unavailable } from './analysis.ts';
import { isLocked, playerPoints } from './points.ts';
import { eligibleWaiverCandidates } from './projections.ts';
import { matchRosterSlots, weeklyBackup } from './roster-construction.ts';
import type { InsightReport, AvailablePlayer } from './projections.ts';
import type { League, Player, Slot } from './types.ts';

const unique = (players: Player[]) => [
  ...new Map(players.map((p) => [p.id, p])).values(),
];
const stream = (p: Player) => ['K', 'DEF', 'D/ST'].includes(p.position);
const supported = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'D/ST',
  'FLEX',
  'SUPERFLEX',
  'REC_FLEX',
  'WRRB_FLEX',
  'RB/WR',
  'WR/TE',
]);
const EPS = 0.0001;
const comparePoints = (a: number, b: number) =>
  Math.abs(a - b) < EPS ? 0 : a - b;

/** Exact rectangular assignment. Dummy columns represent empty slots. A filled
 * legal slot takes priority over points, then existing assignments break ties.
 * This is an optimizer of provider values, never a player projection model. */
function assign(slots: Slot[], players: Player[]): (Player | null)[] {
  const n = slots.length,
    m = players.length + n;
  if (!n) return [];
  const bonus =
    (Math.max(1, ...players.map((p) => Math.abs(p.projection!))) * 2 + 1) *
    (n + 1);
  const cost = slots.map((s) =>
    Array.from({ length: m }, (_, j) =>
      j >= players.length
        ? 0
        : players[j].eligible.includes(s.key)
          ? -bonus -
            players[j].projection! -
            (players[j].slot === s.id ? 1e-8 : 0)
          : bonus * (n + 1),
    ),
  );
  const u = new Float64Array(n + 1),
    v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1),
    way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const min = new Float64Array(m + 1).fill(Infinity),
      used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity,
        j1 = 0;
      for (let j = 1; j <= m; j++)
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < min[j]) {
            min[j] = cur;
            way[j] = j0;
          }
          if (min[j] < delta) {
            delta = min[j];
            j1 = j;
          }
        }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else min[j] -= delta;
      }
      j0 = j1;
    } while (p[j0]);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const result: (Player | null)[] = Array(n).fill(null);
  for (let j = 1; j <= players.length; j++)
    if (p[j]) result[p[j] - 1] = players[j - 1];
  return result;
}

// Pin against the ORIGINAL lineup in every what-if, including a locked FLEX.
export function fitWeeklyRoster(
  league: League,
  roster = league.players,
  now = Date.now(),
) {
  const fixed = new Map<string, Player>();
  for (const s of league.slots) {
    const p = league.players.find((p) => p.slot === s.id);
    if (
      p &&
      (isLocked(p, now) ||
        p.locked === null ||
        (!unavailable(p) && playerPoints(p, now).value === null))
    )
      fixed.set(s.id, p);
  }
  const held = new Set([...fixed.values()].map((p) => p.id));
  const slots = league.slots.filter((s) => !fixed.has(s.id));
  const players = unique(roster).filter(
    (p) => !held.has(p.id) && weeklyBackup(p, now),
  );
  const chosen = assign(slots, players);
  const mutable = slots.map((slot, i) => ({ slot, player: chosen[i] }));
  const assignments = league.slots.map((slot) => ({
    slot,
    player:
      fixed.get(slot.id) ??
      mutable.find((a) => a.slot.id === slot.id)?.player ??
      null,
  }));
  const score = chosen.reduce((sum, p) => sum + (p?.projection ?? 0), 0);
  const values = assignments.map((a) => playerPoints(a.player, now).value);
  return {
    assignments,
    score,
    filled: chosen.filter(Boolean).length,
    missing: mutable.filter((a) => !a.player).map((a) => a.slot),
    total: values.some((v) => v === null)
      ? null
      : values.reduce<number>((a, b) => a + b!, 0),
  };
}
type Fit = ReturnType<typeof fitWeeklyRoster>;
type DepthChange = {
  starter: Player;
  before: Fit;
  after: Fit;
  gain: number;
  coverage: number;
  beforeNames: string[];
  afterNames: string[];
};
export type RosterMove = {
  add: AvailablePlayer;
  drop: Player | null;
  after: Fit;
  gain: number;
  coverage: number;
  starts: { slot: Slot; replaces: Player | null } | null;
  depth: DepthChange | null;
  depthLoss: DepthChange | null;
  byeHelp: number[];
  byeHarm: number[];
  kind: 'repair' | 'upgrade' | 'depth' | 'bye' | 'stream';
};

function byeCoverage(league: League, roster: Player[], week: number) {
  const active = roster.filter(
    (p) => !p.reserve && !p.taxi && p.byeWeek !== week,
  );
  return {
    possible: matchRosterSlots(league.slots, active).filled,
    confirmed: matchRosterSlots(
      league.slots,
      active.filter((p) => p.byeWeek != null),
    ).filled,
  };
}

export function buildTeamRosterPlan(
  report: InsightReport,
  now = Date.now(),
  protectedIds: string[] = [],
) {
  const { league } = report,
    analysis = analyze(league, now);
  const active = unique(league.players).filter((p) => !p.reserve && !p.taxi);
  const capacity =
    league.rosterRules?.benchSlots == null
      ? null
      : league.slots.length + league.rosterRules.benchSlots;
  const free = capacity === null ? null : capacity - active.length;
  const stamp = Date.parse(report.fetchedAt);
  const fresh =
    report.projectionSource === 'provider' &&
    Number.isFinite(stamp) &&
    now - stamp <= 300000 &&
    stamp <= now + 60000 &&
    !league.stale &&
    !league.error;
  const supportedFormat =
    league.slots.length <= 16 &&
    league.slots.every((s) => supported.has(s.label)) &&
    !league.rosterRules?.bestBall &&
    league.rosterRules?.format !== 'special';
  const enabled = fresh && analysis.enabled && supportedFormat;
  // Missing actuals on pinned players cancel out of remaining-points comparisons.
  // Unknown projections/eligibility elsewhere cannot establish the best roster.
  const comparable =
    enabled &&
    analysis.review.every(
      (r) => r.kind === 'actual' && isLocked(r.player, now),
    );
  const baseline = fitWeeklyRoster(league, league.players, now);
  const currentIds = new Set(
    league.players.filter((p) => p.slot).map((p) => p.id),
  );
  const repairs = enabled
    ? analysis.assignments.filter(
        (a) =>
          !a.locked &&
          a.recommended &&
          a.recommended.id !== a.current?.id &&
          weeklyBackup(a.recommended, now),
      )
    : [];
  const starters = baseline.assignments.flatMap((a) =>
    a.player && weeklyBackup(a.player, now) && !stream(a.player)
      ? [a.player]
      : [],
  );
  const starterIds = new Set(
    baseline.assignments.flatMap((a) => (a.player ? [a.player.id] : [])),
  );
  const weeks = Array.from(
    { length: Math.max(0, Math.min(4, 18 - league.currentWeek)) },
    (_, i) => league.currentWeek + i + 1,
  );
  const baseByes = weeks.map((week) => byeCoverage(league, active, week));
  const baseAbsences = new Map(
    starters.map((p) => [
      p.id,
      fitWeeklyRoster(
        league,
        active.filter((x) => x.id !== p.id),
        now,
      ),
    ]),
  );
  const names = (fit: Fit) =>
    fit.assignments.flatMap((a) =>
      a.player && !starterIds.has(a.player.id) ? [a.player.name] : [],
    );
  const contingencies = comparable
    ? starters
        .map((starter) => {
          const fallback = baseAbsences.get(starter.id)!;
          return {
            starter,
            fallback,
            replacements: names(fallback),
            loss: baseline.score - fallback.score,
          };
        })
        .sort(
          (a, b) =>
            Number(/QUESTIONABLE|DOUBTFUL|DAY_TO_DAY/i.test(b.starter.injury)) -
              Number(
                /QUESTIONABLE|DOUBTFUL|DAY_TO_DAY/i.test(a.starter.injury),
              ) || b.loss - a.loss,
        )
    : [];
  const candidates = comparable ? eligibleWaiverCandidates(report, now) : [];
  // Preserve different position and near-term bye alternatives, not only top QBs.
  const groups = new Map<string, AvailablePlayer[]>();
  for (const p of [...candidates].sort(
    (a, b) => b.projection! - a.projection!,
  )) {
    const key =
      [...p.eligible].sort().join(',') +
      ':' +
      (p.byeWeek == null
        ? '?'
        : weeks.includes(p.byeWeek)
          ? p.byeWeek
          : 'later');
    const bucket = groups.get(key) ?? [];
    if (bucket.length < 2 && !bucket.some((x) => x.id === p.id)) bucket.push(p);
    groups.set(key, bucket);
  }
  const shortlist = [0, 1]
    .flatMap((i) => [...groups.values()].flatMap((g) => (g[i] ? [g[i]] : [])))
    .slice(0, 48);
  const protectedSet = new Set(protectedIds);
  const drops: (Player | null)[] =
    free !== null && free > 0
      ? [null]
      : active.filter(
          (p) =>
            weeklyBackup(p, now) &&
            p.dropLocked !== true &&
            (!p.injury || p.injury === 'ACTIVE') &&
            !p.pendingTransaction &&
            !protectedSet.has(p.id),
        );
  const moves: RosterMove[] = [];
  const canCompareMoves =
    comparable &&
    report.ownershipVerified &&
    league.transactionLocked !== true &&
    (free === null || free >= 0);
  let comparisons = 0;
  if (canCompareMoves)
    for (const add of shortlist) {
      const options: RosterMove[] = [];
      for (const drop of drops) {
        // Streaming should recycle that position, not consume a skill-player
        // bench place for a tiny kicker/defense edge.
        if (drop && stream(add) && drop.position !== add.position) continue;
        const roster = [
          ...active.filter((p) => p.id !== drop?.id),
          { ...add, slot: null },
        ];
        const limit = league.rosterRules?.positionLimits?.[add.position];
        if (
          limit &&
          [...league.players.filter((p) => p.id !== drop?.id), add].filter(
            (p) => p.position === add.position,
          ).length > limit
        )
          continue;
        comparisons++;
        const after = fitWeeklyRoster(league, roster, now);
        const gain = after.score - baseline.score,
          coverage = after.filled - baseline.filled;
        if (coverage < 0 || (coverage === 0 && gain < -EPS)) continue;
        const chosen = after.assignments.find((a) => a.player?.id === add.id);
        const starts = chosen
          ? {
              slot: chosen.slot,
              replaces:
                baseline.assignments.find((a) => a.slot.id === chosen.slot.id)
                  ?.player ?? null,
            }
          : null;
        let depth: DepthChange | null = null,
          depthLoss: DepthChange | null = null;
        for (const starter of starters) {
          if (
            starter.id === drop?.id ||
            !after.assignments.some((a) => a.player?.id === starter.id)
          )
            continue;
          const before = baseAbsences.get(starter.id)!;
          const next = fitWeeklyRoster(
            league,
            roster.filter((p) => p.id !== starter.id),
            now,
          );
          // Subtract the ordinary lineup gain: only incremental backup value counts.
          const change = {
            starter,
            before,
            after: next,
            gain: next.score - before.score - gain,
            coverage: next.filled - before.filled - coverage,
            beforeNames: names(before),
            afterNames: names(next),
          };
          if (
            (change.coverage > 0 ||
              (change.coverage === 0 && change.gain > EPS)) &&
            (!depth ||
              change.coverage > depth.coverage ||
              (change.coverage === depth.coverage && change.gain > depth.gain))
          )
            depth = change;
          if (
            (change.coverage < 0 ||
              (change.coverage === 0 && change.gain < -EPS)) &&
            (!depthLoss ||
              change.coverage < depthLoss.coverage ||
              (change.coverage === depthLoss.coverage &&
                change.gain < depthLoss.gain))
          )
            depthLoss = change;
        }
        const future = weeks.map((week) => byeCoverage(league, roster, week));
        const byeHelp = weeks.filter(
          (_, i) => future[i].confirmed > baseByes[i].possible,
        );
        const byeHarm = weeks.filter(
          (_, i) =>
            future[i].possible < baseByes[i].possible ||
            future[i].confirmed < baseByes[i].confirmed,
        );
        const harmfulDepth =
          depthLoss && (depthLoss.coverage < 0 || depthLoss.gain < -0.9999);
        const kind =
          coverage > 0
            ? 'repair'
            : stream(add) && gain >= 0.5
              ? 'stream'
              : gain > EPS && !stream(add)
                ? 'upgrade'
                : byeHelp.length &&
                    !byeHarm.length &&
                    !harmfulDepth &&
                    add.projection! >= 1 &&
                    !stream(add)
                  ? 'bye'
                  : depth &&
                      (depth.coverage > 0 || depth.gain >= 1) &&
                      add.projection! >= 1 &&
                      !harmfulDepth &&
                      !byeHarm.length &&
                      !stream(add)
                    ? 'depth'
                    : null;
        if (kind)
          options.push({
            add,
            drop,
            after,
            gain,
            coverage,
            starts,
            depth,
            depthLoss,
            byeHelp,
            byeHarm,
            kind,
          });
      }
      // Same pickup: prefer its real starting gain, then preserve future cover and
      // the strongest individual contingency. Never add absence scenarios together.
      options.sort(
        (a, b) =>
          b.coverage - a.coverage ||
          comparePoints(b.gain, a.gain) ||
          a.byeHarm.length - b.byeHarm.length ||
          (b.depthLoss?.coverage ?? 0) - (a.depthLoss?.coverage ?? 0) ||
          comparePoints(b.depthLoss?.gain ?? 0, a.depthLoss?.gain ?? 0) ||
          b.byeHelp.length - a.byeHelp.length ||
          (b.depth?.coverage ?? 0) - (a.depth?.coverage ?? 0) ||
          comparePoints(b.depth?.gain ?? 0, a.depth?.gain ?? 0) ||
          Number(!!a.drop && currentIds.has(a.drop.id)) -
            Number(!!b.drop && currentIds.has(b.drop.id)) ||
          (a.drop?.projection ?? 0) - (b.drop?.projection ?? 0),
      );
      if (options[0]) moves.push(options[0]);
    }
  const rank = { repair: 0, upgrade: 1, bye: 2, depth: 3, stream: 4 };
  moves.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      b.coverage - a.coverage ||
      comparePoints(b.gain, a.gain) ||
      b.byeHelp.length - a.byeHelp.length ||
      Number(/QUESTIONABLE|DOUBTFUL/i.test(b.depth?.starter.injury ?? '')) -
        Number(/QUESTIONABLE|DOUBTFUL/i.test(a.depth?.starter.injury ?? '')) ||
      (b.depth?.gain ?? 0) - (a.depth?.gain ?? 0),
  );
  const upgrades = moves
    .filter((m) => m.kind === 'repair' || m.kind === 'upgrade')
    .slice(0, 3);
  // One alternative for each specific depth/bye problem; no page of duplicates.
  const needKeys = new Set<string>();
  const depthMoves = moves
    .filter((m) => m.kind === 'depth' || m.kind === 'bye')
    .filter((m) => {
      const key =
        m.depth?.starter.id ?? `bye:${m.byeHelp.join(',')}:${m.add.position}`;
      if (needKeys.has(key)) return false;
      needKeys.add(key);
      return true;
    })
    .slice(0, 3);
  const streams = ['K', 'DEF'].flatMap(
    (pos) =>
      moves.find(
        (m) =>
          m.kind === 'stream' &&
          (m.add.position === 'D/ST' ? 'DEF' : m.add.position) === pos,
      ) ?? [],
  );
  const bench = active
    .filter((p) => !starterIds.has(p.id))
    .map((player) => {
      let protects: {
        starter: Player;
        points: number;
        coverage: number;
      } | null = null;
      if (comparable && weeklyBackup(player, now))
        for (const starter of starters) {
          const before = baseAbsences.get(starter.id)!;
          const without = fitWeeklyRoster(
            league,
            active.filter((p) => p.id !== player.id && p.id !== starter.id),
            now,
          );
          const value = {
            starter,
            points: before.score - without.score,
            coverage: before.filled - without.filled,
          };
          if (
            (value.points > EPS || value.coverage > 0) &&
            (!protects ||
              value.coverage > protects.coverage ||
              (value.coverage === protects.coverage &&
                value.points > protects.points))
          )
            protects = value;
        }
      const coversByes = weeks.filter(
        (_, i) =>
          byeCoverage(
            league,
            active.filter((p) => p.id !== player.id),
            weeks[i],
          ).confirmed < baseByes[i].confirmed,
      );
      return {
        player,
        protects,
        coversByes,
        protected: protectedSet.has(player.id),
      };
    });
  const byes = weeks
    .map((week, i) => ({
      week,
      absent: active.filter((p) => p.byeWeek === week),
      missing: league.slots.length - baseByes[i].possible,
      uncertain: baseByes[i].confirmed < baseByes[i].possible,
    }))
    .filter((b) => b.absent.length || b.missing);
  let reason = '';
  if (!fresh) reason = 'Refresh this league to rebuild its roster plan.';
  else if (!analysis.enabled)
    reason =
      analysis.reasons[0] ?? 'Weekly lineup comparisons are unavailable.';
  else if (!supportedFormat)
    reason =
      'This format supports roster inventory only; managed-lineup comparisons are not available.';
  else if (!comparable)
    reason =
      'Some player projections or lineup locks need review. Verified lineup changes are shown, but complete roster comparisons are paused.';
  else if (!report.ownershipVerified)
    reason =
      'Available-player ownership needs to be refreshed before comparing transactions.';
  else if (league.transactionLocked)
    reason =
      'Your provider reports that this team cannot make transactions right now.';
  else if (free !== null && free < 0)
    reason = `Your active roster is ${Math.abs(free)} over capacity. Resolve that before a one-for-one pickup.`;
  else if (!drops.length)
    reason =
      'No eligible roster place is available in this comparison. Review your protected players or wait for game locks to clear.';
  return {
    analysis,
    baseline,
    repairs,
    contingencies,
    upgrades,
    depthMoves,
    streams,
    bench,
    byes,
    active: active.length,
    capacity,
    free,
    comparable,
    enabled,
    reason,
    comparisons,
    checked: shortlist.length,
    available: candidates.length,
    canCompareMoves,
    protectedIds,
  };
}
