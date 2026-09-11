import { analyze, isLocked, unavailable } from './analysis.ts';
import type { League, Player } from './types.ts';
import { playerPoints } from './points.ts';

// Every projection is supplied by the league provider. No custom forecasts or role adjustments.
export type AvailablePlayer = Player & {
  availability?: string;
  waiverDate?: number | null;
};
export type WaiverPick = {
  player: AvailablePlayer;
  gain: number | null;
  fills: string | null;
  reason: string;
};
export type InsightReport = {
  projectionSource: 'provider';
  league: League;
  candidates: AvailablePlayer[];
  fetchedAt: string;
  evaluated: number;
  warnings: string[];
  ownershipVerified: boolean;
};
const round = (n: number) => Math.round(n * 100) / 100;
export function rankWaivers(
  report: InsightReport,
  now = Date.now(),
): WaiverPick[] {
  const { league } = report;
  if (
    report.projectionSource !== 'provider' ||
    !report.ownershipVerified ||
    !Number.isFinite(Date.parse(report.fetchedAt)) ||
    now - Date.parse(report.fetchedAt) > 300000 ||
    Date.parse(report.fetchedAt) > now + 60000 ||
    league.stale ||
    league.error ||
    league.week !== league.currentWeek ||
    league.status !== 'in_season'
  )
    return [];
  const baseline = analyze(league, now);
  if (!baseline.enabled) return [];
  const own = new Set(league.players.map((p) => p.id));
  // A league-wide ownership check occurs at the provider boundary. This second check also guards malformed payloads.
  const candidates = report.candidates.filter(
    (p) =>
      !own.has(p.id) &&
      !unavailable(p) &&
      !isLocked(p, now) &&
      p.locked === false &&
      playerPoints(p, now).basis === 'projection' &&
      playerPoints(p, now).value !== null &&
      p.projection !== null &&
      Number.isFinite(p.projection) &&
      !p.partial &&
      !(
        p.waiverDate != null &&
        p.kickoff !== null &&
        p.waiverDate >= p.kickoff
      ) &&
      league.slots.some((s) => p.eligible.includes(s.key)),
  );
  // Keep the search bounded while preserving each distinct eligible-position combination.
  const perPosition = new Map<string, number>();
  const shortlist = candidates
    .sort((a, b) => b.projection! - a.projection!)
    .filter((p) => {
      const key = [...p.eligible].sort().join(','),
        n = perPosition.get(key) ?? 0;
      perPosition.set(key, n + 1);
      return n < 4;
    })
    .slice(0, 24);
  return shortlist
    .map((player) => {
      const next =
        league.slots.length <= 10
          ? analyze(
              {
                ...league,
                players: [...league.players, { ...player, slot: null }],
              },
              now,
              player.id,
            )
          : baseline;
      const chosen = next.assignments.find(
        (a) => a.recommended?.id === player.id,
      );
      const gain =
        league.slots.length <= 10 &&
        baseline.complete &&
        next.complete &&
        baseline.recommendedTotal !== null &&
        next.recommendedTotal !== null
          ? round(
              Math.max(0, next.recommendedTotal - baseline.recommendedTotal),
            )
          : null;
      return {
        player,
        gain,
        fills: chosen?.slot.label ?? null,
        reason:
          gain !== null && gain > 0
            ? `Could improve your optimized lineup at ${chosen?.slot.label ?? player.position}.`
            : chosen && !chosen.current
              ? `Could cover an empty ${chosen.slot.label} slot.`
              : gain === null
                ? chosen
                  ? `Could compete for ${chosen.slot.label}; incomplete provider projections prevent a reliable total-gain estimate.`
                  : 'Depth option. A reliable lineup-gain estimate is unavailable with this roster’s data or slot limits.'
                : 'Depth option. No starting improvement under the current lineup constraints.',
      };
    })
    .sort(
      (a, b) =>
        (b.gain ?? -1) - (a.gain ?? -1) ||
        Number(!!b.fills) - Number(!!a.fills) ||
        b.player.projection! - a.player.projection!,
    )
    .slice(0, 12);
}
