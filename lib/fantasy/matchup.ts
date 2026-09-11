import { analyze, total } from './analysis.ts';
import type { InsightReport } from './projections.ts';
import type { Player } from './types.ts';
import { playerPoints, scoreProgress } from './points.ts';

const round = (value: number) => Math.round(value * 10) / 10;
const difference = (a: number | null, b: number | null) =>
  a === null || b === null ? null : round(a - b);

export function analyzeMatchup(report: InsightReport, now = Date.now()) {
  const known = (p: Player | null): p is Player =>
    !!p && playerPoints(p, now).value !== null;
  const sum = (players: (Player | null)[]) => total(players, now);
  const { league } = report;
  const opponent = league.opponent;
  const fresh =
    report.projectionSource === 'provider' &&
    Number.isFinite(Date.parse(report.fetchedAt)) &&
    now - Date.parse(report.fetchedAt) <= 300000 &&
    Date.parse(report.fetchedAt) <= now + 60000 &&
    !league.stale &&
    !league.error;
  const current =
    league.week === league.currentWeek && league.status === 'in_season';
  const unique = (players: Player[]) =>
    players.every(
      (p) =>
        typeof p.id === 'string' && p.id.length > 0 && p.id !== 'undefined',
    ) &&
    new Set(players.map((p) => p.id)).size === players.length &&
    new Set(players.filter((p) => p.slot).map((p) => p.slot)).size ===
      players.filter((p) => p.slot).length &&
    players
      .filter((p) => p.slot)
      .every((p) =>
        league.slots.some((s) => s.id === p.slot && p.eligible.includes(s.key)),
      );
  const verified =
    !!opponent?.rosterVerified &&
    !!opponent.players &&
    unique(opponent.players) &&
    unique(league.players);
  const available = fresh && current && verified && league.slots.length > 0;
  const analysis = analyze({ ...league, stale: !fresh || !!league.stale }, now);
  const rows = league.slots.map((slot) => ({
    slot,
    mine: league.players.find((p) => p.slot === slot.id) ?? null,
    suggested:
      analysis.assignments.find((a) => a.slot.id === slot.id)?.recommended ??
      null,
    theirs: opponent?.players?.find((p) => p.slot === slot.id) ?? null,
  }));
  const submitted = available ? sum(rows.map((r) => r.mine)) : null;
  const opposing = available ? sum(rows.map((r) => r.theirs)) : null;
  const suggested =
    available && analysis.enabled ? sum(rows.map((r) => r.suggested)) : null;
  const groups = [...new Set(league.slots.map((s) => s.label))].map((label) => {
    const slots = rows.filter((r) => r.slot.label === label);
    const mine = available ? sum(slots.map((r) => r.mine)) : null;
    const theirs = available ? sum(slots.map((r) => r.theirs)) : null;
    return {
      label,
      count: slots.length,
      mine,
      theirs,
      edge: difference(mine, theirs),
    };
  });
  const edges = groups.filter((g) => g.edge !== null);
  const progress = {
    mine: scoreProgress(
      rows.map((r) => r.mine),
      now,
    ),
    theirs: scoreProgress(
      rows.map((r) => r.theirs),
      now,
    ),
  };
  return {
    available,
    reason: !opponent
      ? 'No head-to-head opponent is scheduled for this week.'
      : !fresh
        ? 'Refresh this league to compare current matchup data.'
        : !current
          ? 'Projected matchup comparisons are available for the current week. The score below is the selected week’s reported score.'
          : !verified
            ? 'The opponent’s submitted lineup could not be verified.'
            : 'Full totals require an actual score or upcoming projection for every starting slot.',
    submitted,
    opposing,
    suggested,
    submittedEdge: difference(submitted, opposing),
    suggestedEdge: difference(suggested, opposing),
    liveEdge: difference(league.actual, opponent?.actual ?? null),
    progress,
    coverage: {
      mine: rows.filter((r) => known(r.mine)).length,
      theirs: rows.filter((r) => known(r.theirs)).length,
      slots: league.slots.length,
    },
    notStarted: {
      mine: progress.mine.upcoming,
      theirs: progress.theirs.upcoming,
    },
    groups,
    rows,
    strongest:
      [...edges]
        .filter((g) => g.edge! > 0)
        .sort((a, b) => b.edge! - a.edge!)[0] ?? null,
    weakest:
      [...edges]
        .filter((g) => g.edge! < 0)
        .sort((a, b) => a.edge! - b.edge!)[0] ?? null,
    threats: available
      ? rows
          .map((r) => r.theirs)
          .filter(known)
          .sort(
            (a, b) => playerPoints(b, now).value! - playerPoints(a, now).value!,
          )
          .slice(0, 3)
      : [],
  };
}
