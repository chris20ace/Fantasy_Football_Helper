import { analyze, isLocked, unavailable } from './analysis.ts';
import type { League, Player } from './types.ts';
import type { RoleAssessment } from './roles.ts';

export type GameSample = {
  season: number;
  week: number;
  points: number;
  partial?: boolean;
  receptions?: number;
  team?: string;
  passAttempts?: number;
  carries?: number;
  targets?: number;
  snaps?: number;
  teamSnaps?: number;
  played?: boolean;
  activeWithoutAppearance?: boolean;
};
export type Forecast = {
  points: number | null;
  low: number | null;
  high: number | null;
  games: number;
  recent: number | null;
  earlier: number | null;
  receptionPoints: number | null;
  history: GameSample[];
  note: string;
  baselinePoints?: number | null;
  baselineHistory?: GameSample[];
};
export type ProjectedPlayer = Player & {
  role?: RoleAssessment;
  forecast: Forecast;
  providerProjection: number | null;
  availability?: string;
  waiverDate?: number | null;
};
export type WaiverPick = {
  player: ProjectedPlayer;
  gain: number | null;
  fills: string | null;
  reason: string;
};
export type InsightReport = {
  league: Omit<League, 'players'> & { players: ProjectedPlayer[] };
  candidates: ProjectedPlayer[];
  historyThrough: string;
  fetchedAt: string;
  evaluated: number;
  warnings: string[];
  model: string;
  ownershipVerified: boolean;
  database?: {
    provider: string;
    rows: number;
    players: number;
    updatedAt: string;
  }[];
};
const round = (n: number) => Math.round(n * 100) / 100;
export function historyWeeks(
  season: number,
  week: number,
  currentWeek: number,
  count = 12,
) {
  let y = season,
    w = Math.min(week, currentWeek) - 1;
  return Array.from({ length: count }, () => {
    if (w < 1) {
      y--;
      w = 18;
    }
    return { season: y, week: w-- };
  });
}
export function project(
  samples: GameSample[],
  season: number,
  week: number,
  currentWeek: number,
  receptionWeight = 0,
): Forecast {
  const window = new Set(
    historyWeeks(season, week, currentWeek).map((s) => `${s.season}:${s.week}`),
  );
  const seen = new Set<string>();
  const games = samples
    .filter((s) => {
      const key = `${s.season}:${s.week}`;
      if (
        !window.has(key) ||
        seen.has(key) ||
        s.played === false ||
        !Number.isFinite(s.points)
      )
        return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.season - a.season || b.week - a.week)
    .slice(0, 8);
  const mean = (rows: GameSample[]) =>
    rows.length
      ? round(rows.reduce((v, g) => v + g.points, 0) / rows.length)
      : null;
  const base = {
    games: games.length,
    history: games,
    recent: mean(games.slice(0, 3)),
    earlier: mean(games.slice(3)),
    receptionPoints: null,
    low: null,
    high: null,
    points: null,
  };
  if (games.some((g) => g.partial))
    return {
      ...base,
      note: 'An active scoring rule is not covered by the historical feed.',
    };
  if (games.length < 3)
    return {
      ...base,
      note: `Insufficient history (${games.length}/3 games). Use the provider estimate and check the player’s role.`,
    };
  const weights = games.map((_, i) => 0.85 ** i),
    sum = weights.reduce((a, b) => a + b, 0);
  const sorted = games.map((g) => g.points).sort((a, b) => a - b);
  return {
    ...base,
    points: round(
      games.reduce((v, g, i) => v + g.points * weights[i], 0) / sum,
    ),
    low: sorted[Math.floor((sorted.length - 1) * 0.2)],
    high: sorted[Math.ceil((sorted.length - 1) * 0.8)],
    receptionPoints: round(
      games.reduce(
        (v, g, i) => v + (g.receptions ?? 0) * receptionWeight * weights[i],
        0,
      ) / sum,
    ),
    note:
      games.length < 6
        ? 'Small sample. Treat this estimate with extra caution.'
        : 'Recent games carry more weight; current matchup and role changes are not modeled.',
  };
}
export function applyForecast(
  player: Player,
  forecast: Forecast,
  role?: RoleAssessment,
): ProjectedPlayer {
  return {
    ...player,
    providerProjection: player.projection,
    forecast,
    role,
    modelExcluded: role?.excluded,
    modelExclusionReason: role?.excluded ? role.detail : undefined,
    projection: player.bye ? 0 : forecast.points,
    partial: forecast.points === null,
  };
}
export function rankWaivers(
  report: InsightReport,
  now = Date.now(),
): WaiverPick[] {
  const { league } = report;
  if (
    !report.ownershipVerified ||
    !Number.isFinite(Date.parse(report.fetchedAt)) ||
    now - Date.parse(report.fetchedAt) > 300000 ||
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
      p.projection !== null &&
      !p.partial &&
      (!p.role ||
        (p.role.verified && !p.role.excluded && p.role.compatibleGames >= 3)) &&
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
                  ? `Could compete for ${chosen.slot.label}; incomplete roster forecasts prevent a reliable total-gain estimate.`
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
