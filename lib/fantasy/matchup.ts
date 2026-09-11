import { analyze, total } from './analysis.ts';
import type { InsightReport, ProjectedPlayer } from './projections.ts';
import type { Player } from './types.ts';

const round = (value: number) => Math.round(value * 10) / 10;
const difference = (a: number | null, b: number | null) =>
  a === null || b === null ? null : round(a - b);
const known = (p: Player | null): p is Player =>
  !!p && p.projection !== null && Number.isFinite(p.projection) && !p.partial;
const sum = (players: (Player | null)[]) =>
  players.every(known) ? total(players) : null;

export function analyzeMatchup(
  report: InsightReport,
  now = Date.now(),
  source: 'model' | 'provider' = 'model',
) {
  const { league } = report;
  const opponent = league.opponent;
  const fresh =
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
  const compare = (player: Player | null): Player | null => {
    if (!player || source === 'model') return player;
    const p = player as Partial<ProjectedPlayer>;
    return {
      ...player,
      projection: p.providerProjection ?? null,
      partial: p.providerPartial !== false,
    };
  };
  const rows = league.slots.map((slot) => ({
    slot,
    mine: compare(league.players.find((p) => p.slot === slot.id) ?? null),
    suggested: compare(
      analysis.assignments.find((a) => a.slot.id === slot.id)?.recommended ??
        null,
    ),
    theirs: compare(opponent?.players?.find((p) => p.slot === slot.id) ?? null),
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
  const notStarted = (players: (Player | null)[]) =>
    players.filter(
      (p) =>
        p?.kickoff !== null &&
        p?.kickoff !== undefined &&
        p.kickoff > now &&
        !p.bye,
    ).length;
  return {
    available,
    reason: !opponent
      ? 'No head-to-head opponent is scheduled for this week.'
      : !fresh
        ? 'Refresh this league to compare current matchup data.'
        : !current
          ? 'Model matchup comparisons are available for the current week. The score below is the selected week’s reported score.'
          : !verified
            ? 'The opponent’s submitted lineup could not be verified.'
            : 'Full totals require an estimate for every starting slot on both teams.',
    submitted,
    opposing,
    suggested,
    submittedEdge: difference(submitted, opposing),
    suggestedEdge: difference(suggested, opposing),
    liveEdge: difference(league.actual, opponent?.actual ?? null),
    coverage: {
      mine: rows.filter((r) => known(r.mine)).length,
      theirs: rows.filter((r) => known(r.theirs)).length,
      slots: league.slots.length,
    },
    notStarted: {
      mine: notStarted(rows.map((r) => r.mine)),
      theirs: notStarted(rows.map((r) => r.theirs)),
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
          .sort((a, b) => b.projection! - a.projection!)
          .slice(0, 3)
      : [],
  };
}
