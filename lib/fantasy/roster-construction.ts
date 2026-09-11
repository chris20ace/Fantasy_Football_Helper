import { analyze, unavailable } from './analysis.ts';
import { isLocked, playerPoints } from './points.ts';
import { eligibleWaiverCandidates } from './projections.ts';
import type { InsightReport, AvailablePlayer } from './projections.ts';
import type { Analysis, Player, Slot } from './types.ts';

const position = (p: Player) => (p.position === 'DEF' ? 'D/ST' : p.position);
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
const unique = (players: Player[]) => [
  ...new Map(players.map((p) => [p.id, p])).values(),
];
export const weeklyBackup = (p: Player, now: number) =>
  !unavailable(p) &&
  !isLocked(p, now) &&
  p.locked === false &&
  playerPoints(p, now).basis === 'projection' &&
  playerPoints(p, now).value !== null;

// Maximum bipartite matching: a multi-position player can fill only one slot.
// This measures legal coverage, never player value or projected points.
export function matchRosterSlots(slots: Slot[], roster: Player[]) {
  const players = unique(roster);
  const assigned = new Map<string, number>();
  const visit = (slotIndex: number, seen: Set<string>): boolean => {
    for (const p of players) {
      if (seen.has(p.id) || !p.eligible.includes(slots[slotIndex].key))
        continue;
      seen.add(p.id);
      const old = assigned.get(p.id);
      if (old === undefined || visit(old, seen)) {
        assigned.set(p.id, slotIndex);
        return true;
      }
    }
    return false;
  };
  slots.forEach((_, i) => visit(i, new Set()));
  const filled = new Set(assigned.values());
  return {
    filled: filled.size,
    missing: slots.filter((_, i) => !filled.has(i)),
  };
}

export function buildRosterPlan(
  report: InsightReport,
  now = Date.now(),
  analysis: Analysis = analyze(report.league, now),
) {
  const { league } = report;
  const rules = league.rosterRules;
  const players = unique(league.players);
  const active = players.filter((p) => !p.reserve && !p.taxi);
  const bench = active.filter((p) => !p.slot);
  const capacity =
    rules?.benchSlots != null ? league.slots.length + rules.benchSlots : null;
  const free = capacity === null ? null : capacity - active.length;
  const supportedSlots = league.slots.filter((s) => supported.has(s.label));
  const limited =
    supportedSlots.length !== league.slots.length ||
    rules?.bestBall === true ||
    rules?.format === 'special';
  const timestamp = Date.parse(report.fetchedAt);
  const fresh =
    report.projectionSource === 'provider' &&
    !league.stale &&
    !league.error &&
    Number.isFinite(timestamp) &&
    now - timestamp <= 300000 &&
    timestamp <= now + 60000;
  const current =
    fresh &&
    league.week === league.currentWeek &&
    league.status === 'in_season';
  const weekly =
    current && !limited && analysis.enabled && analysis.review.length === 0;
  const pool = weekly ? active.filter((p) => weeklyBackup(p, now)) : [];
  const fixed = league.slots.filter((s) =>
    active.some((p) => p.slot === s.id && isLocked(p, now)),
  );
  const openSlots = league.slots.filter((s) => !fixed.includes(s));
  const coverage = matchRosterSlots(openSlots, pool);
  const candidates = weekly
    ? eligibleWaiverCandidates(report, now).sort(
        (a, b) => b.projection! - a.projection!,
      )
    : [];
  const needs: {
    title: string;
    detail: string;
    names: string[];
    options: AvailablePlayer[];
    priority: 'immediate' | 'contingency';
  }[] = [];
  const optionsFor = (roster: Player[], expected: number) =>
    candidates
      .filter(
        (p) => matchRosterSlots(openSlots, [...roster, p]).filled > expected,
      )
      .slice(0, 2);
  if (weekly && coverage.missing.length) {
    needs.push({
      title: `Cover ${coverage.missing.length} unfilled ${coverage.missing.length === 1 ? 'slot' : 'slots'}`,
      detail: `Your available players cannot fill every remaining starting slot (${coverage.missing.map((s) => s.label).join(', ')}). Check your lineup first, then compare additions that improve coverage.`,
      names: [],
      options: optionsFor(pool, coverage.filled),
      priority: 'immediate',
    });
  } else if (weekly) {
    for (const a of analysis.assignments) {
      const p = a.recommended;
      if (!p || !weeklyBackup(p, now)) continue;
      const without = pool.filter((x) => x.id !== p.id);
      const fallback = matchRosterSlots(openSlots, without);
      if (!fallback.missing.length) continue;
      const options = optionsFor(without, fallback.filled);
      needs.push({
        title: `Have a fallback for ${p.name}`,
        names: [p.name],
        detail: `If ${p.name} cannot play, this roster cannot fill all remaining slots with confirmed available players. Flexible slots and locked players are included in this check.`,
        options,
        priority: /QUESTIONABLE|DOUBTFUL|DAY_TO_DAY/i.test(p.injury)
          ? 'immediate'
          : 'contingency',
      });
    }
  }
  const rows = [...new Set(players.map(position))]
    .sort(
      (a, b) =>
        (['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'].indexOf(a) + 1 || 99) -
        (['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'].indexOf(b) + 1 || 99),
    )
    .map((pos) => {
      const atPosition = players.filter((p) => position(p) === pos);
      return {
        position: pos,
        players: atPosition,
        starting: atPosition.filter((p) => p.slot && !p.reserve && !p.taxi),
        bench: atPosition.filter((p) => !p.slot && !p.reserve && !p.taxi),
        ready: weekly
          ? atPosition.filter((p) => !p.slot && weeklyBackup(p, now))
          : [],
        reserve: atPosition.filter((p) => p.reserve || p.taxi),
      };
    });
  const upcoming = Array.from(
    {
      length: Math.max(
        0,
        Math.min(18, league.currentWeek + 4) - league.currentWeek,
      ),
    },
    (_, i) => league.currentWeek + i + 1,
  );
  const byeUnknown = active.filter((p) => p.byeWeek == null);
  const byes = upcoming
    .map((week) => {
      const absent = active.filter((p) => p.byeWeek === week);
      // Future planning checks only confirmed byes and position eligibility.
      // Today's injuries, locks and points cannot predict future availability.
      const known = active.filter(
        (p) => p.byeWeek != null && p.byeWeek !== week,
      );
      const remaining = active.filter((p) => p.byeWeek !== week);
      const bestCase = matchRosterSlots(supportedSlots, remaining);
      const confirmed = matchRosterSlots(supportedSlots, known);
      return {
        week,
        absent,
        missing: bestCase.missing,
        uncertain:
          bestCase.missing.length === 0 && confirmed.missing.length > 0,
      };
    })
    .filter((b) => b.absent.length > 0);
  const qbSlots = league.slots.filter((s) => s.label === 'QB').length;
  const superflex = league.slots.filter((s) => s.label === 'SUPERFLEX').length;
  const teSlots = league.slots.filter((s) => s.label === 'TE').length;
  const tips: { title: string; text: string; source: string }[] = [];
  if (qbSlots > 1 || superflex)
    tips.push({
      title: 'Protect your quarterback options',
      text: `${qbSlots} required QB ${qbSlots === 1 ? 'slot' : 'slots'}${superflex ? ` + ${superflex} SUPERFLEX` : ''}. QB supply matters more here. A non-QB can cover SUPERFLEX, but compare the provider points before treating those options as equivalent.`,
      source: 'formats',
    });
  else if (qbSlots === 1)
    tips.push({
      title: 'Make each backup earn its place',
      text: `You have ${bench.filter((p) => p.position === 'QB').length} benched QBs for one required QB slot. Weigh bye or injury cover against a useful RB/WR addition; streaming only works if comparable QBs are actually available.`,
      source: 'bench',
    });
  if (rules?.format === 'dynasty' || rules?.format === 'keeper')
    tips.push({
      title:
        rules.format === 'dynasty'
          ? 'Keep future value in the decision'
          : 'Check keeper cost before a drop',
      text: 'A quiet week or a zero projection does not measure future value. Review development, keeper cost and trade demand before releasing a player. IR and taxi players are separate from active coverage.',
      source: rules.format,
    });
  else
    tips.push({
      title: 'Give every bench place a job',
      text: 'Use it for a near-term starter, dated bye or injury cover, or a supported future opportunity. Before dropping someone, compare that purpose with the addition; one weekly projection is not a rest-of-season ranking.',
      source: 'bench',
    });
  if (teSlots > 1 || (rules?.teReceptionBonus ?? 0) > 0)
    tips.push({
      title: 'Tight end value follows your rules',
      text: `${teSlots} dedicated TE ${teSlots === 1 ? 'slot' : 'slots'}${(rules?.teReceptionBonus ?? 0) > 0 ? ` and a +${rules!.teReceptionBonus} reception bonus` : ''}. Compare TEs against eligible replacements. The provider projections already include your scoring; no extra multiplier is added.`,
      source: 'premium',
    });
  else
    tips.push({
      title: 'Spend for a useful role, not last week’s score',
      text: 'Prioritize a starter upgrade or coverage you can use. For a speculative stash, verify usage and the path to playing time. Set a bid from your remaining budget and league demand, then prepare a fallback claim.',
      source: 'waivers',
    });
  return {
    rows,
    active: active.length,
    bench: bench.length,
    ir: players.filter((p) => p.reserve).length,
    taxi: players.filter((p) => p.taxi).length,
    capacity,
    free,
    needs,
    byes,
    byeUnknown: byeUnknown.length,
    tips,
    fresh,
    current,
    weekly,
    limited,
    ownershipVerified: report.ownershipVerified,
    open: openSlots.length,
    covered: weekly ? coverage.filled : null,
    protected: fixed.length,
    format: rules?.format ?? 'unknown',
  };
}
