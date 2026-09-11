import type { Analysis, League, Player } from './types';
export const unavailable = (p: Player) =>
  p.modelExcluded === true ||
  p.bye ||
  /^(OUT|IR|INJURY_RESERVE|SUSPENDED|PUP|DNR|NA)$/i.test(p.injury) ||
  p.reserve ||
  p.taxi;
export function isLocked(p: Player, now = Date.now()) {
  return p.locked === true || (p.kickoff !== null && p.kickoff <= now);
}
export function total(players: (Player | null)[]): number | null {
  return players.some((p) => !p || p.projection === null || p.partial)
    ? null
    : players.reduce((sum, p) => sum + p!.projection!, 0);
}
export function analyze(league: League, now = Date.now()): Analysis {
  const current = league.slots.map(
    (s) => league.players.find((p) => p.slot === s.id) ?? null,
  );
  const enabled =
    league.status === 'in_season' &&
    league.week === league.currentWeek &&
    !league.stale &&
    !league.error &&
    league.slots.length <= 16;
  const issues = current.flatMap<Analysis['issues'][number]>((p, i) =>
    !p
      ? [
          {
            player: null,
            slot: league.slots[i].label,
            reason: 'Empty starting slot',
          },
        ]
      : unavailable(p)
        ? [
            {
              player: p,
              slot: league.slots[i].label,
              reason: p.modelExcluded
                ? (p.modelExclusionReason ??
                  'NFL role does not support a starting projection')
                : p.bye
                  ? 'Bye week'
                  : p.reserve
                    ? 'On injured reserve'
                    : p.taxi
                      ? 'On taxi squad'
                      : `Unavailable · ${p.injury.replaceAll('_', ' ')}`,
            },
          ]
        : /QUESTIONABLE|DOUBTFUL|DAY_TO_DAY/i.test(p.injury)
          ? [
              {
                player: p,
                slot: league.slots[i].label,
                reason: `Monitor · ${p.injury.replaceAll('_', ' ')}`,
              },
            ]
          : [],
  );
  const reasons: string[] = [];
  if (league.status !== 'in_season')
    reasons.push('League is not in season. Rosters are shown for planning.');
  if (league.week < league.currentWeek)
    reasons.push(
      'Past week: lineup advice is disabled. Injury labels describe the latest roster snapshot.',
    );
  if (league.week > league.currentWeek)
    reasons.push(
      'Future week: current roster and injury labels are for reference. Actionable lineup advice starts when this week is current.',
    );
  if (league.stale || league.error)
    reasons.push(
      'Refresh this league before acting on lineup recommendations.',
    );
  const unknown = league.players.filter(
    (p) =>
      !p.reserve &&
      !p.taxi &&
      !unavailable(p) &&
      (p.projection === null || p.partial),
  );
  if (unknown.length)
    reasons.push(
      `${unknown.length} player${unknown.length === 1 ? ' has' : 's have'} missing or incomplete projections; those players are held out of swaps.`,
    );
  const pinned = current.map(
    (p) =>
      !!p &&
      (isLocked(p, now) ||
        p.locked === null ||
        (!unavailable(p) && (p.projection === null || p.partial))),
  );
  if (current.some((p) => p?.locked === null))
    reasons.push('Unknown game lock: current starter held in place.');
  const result = [...current];
  if (enabled) {
    const free = league.slots.map((_, i) => i).filter((i) => !pinned[i]);
    const held = new Set(current.filter((_, i) => pinned[i]).map((p) => p!.id));
    const candidates = league.players.filter(
      (p) =>
        !held.has(p.id) &&
        !unavailable(p) &&
        !isLocked(p, now) &&
        p.locked !== null &&
        p.projection !== null &&
        !p.partial,
    );
    type State = { score: number; changes: number; ids: (Player | null)[] };
    let dp = new Map<number, State>([
      [0, { score: 0, changes: 0, ids: Array(free.length).fill(null) }],
    ]);
    for (const p of candidates) {
      const next = new Map(dp);
      for (const [mask, state] of dp)
        for (let j = 0; j < free.length; j++) {
          if (
            mask & (1 << j) ||
            !p.eligible.includes(league.slots[free[j]].key)
          )
            continue;
          const newMask = mask | (1 << j),
            score = state.score + p.projection!,
            changes = state.changes + (current[free[j]]?.id === p.id ? 0 : 1),
            old = next.get(newMask);
          if (
            !old ||
            score > old.score + 0.0001 ||
            (Math.abs(score - old.score) < 0.0001 && changes < old.changes)
          ) {
            const ids = [...state.ids];
            ids[j] = p;
            next.set(newMask, { score, changes, ids });
          }
        }
      dp = next;
    }
    const bits = (n: number) => {
      let k = 0;
      while (n) {
        n &= n - 1;
        k++;
      }
      return k;
    };
    const best = [...dp.entries()].sort(
      (a, b) =>
        bits(b[0]) - bits(a[0]) ||
        b[1].score - a[1].score ||
        a[1].changes - b[1].changes,
    )[0][1];
    free.forEach((i, j) => {
      result[i] = best.ids[j];
    });
  }
  const existing = new Set(current.filter(Boolean).map((p) => p!.id)),
    recommended = new Set(result.filter(Boolean).map((p) => p!.id));
  const currentTotal = total(current),
    recommendedTotal = total(result);
  return {
    assignments: league.slots.map((slot, i) => ({
      slot,
      current: current[i],
      recommended: result[i],
      locked: !!current[i] && isLocked(current[i]!, now),
    })),
    currentTotal,
    recommendedTotal,
    gain:
      enabled && currentTotal !== null && recommendedTotal !== null
        ? recommendedTotal - currentTotal
        : null,
    changes: result.filter((p): p is Player => !!p && !existing.has(p.id)),
    removed: current.filter((p): p is Player => !!p && !recommended.has(p.id)),
    issues,
    complete:
      enabled &&
      unknown.length === 0 &&
      recommendedTotal !== null &&
      !league.players.some((p) => p.locked === null && !unavailable(p)),
    enabled,
    reasons,
  };
}
export function exposure(leagues: League[]) {
  const rows = new Map<
    string,
    {
      key: string;
      name: string;
      position: string;
      team: string;
      injury: string;
      leagues: { id: string; name: string; starter: boolean }[];
    }
  >();
  for (const l of leagues
    .filter((l) => l.players.length)
    .sort(
      (a, b) =>
        Number(!!a.stale) - Number(!!b.stale) ||
        Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt),
    ))
    for (const p of l.players) {
      let row = rows.get(p.key);
      if (!row) {
        row = {
          key: p.key,
          name: p.name,
          position: p.position,
          team: p.team,
          injury: p.injury,
          leagues: [],
        };
        rows.set(p.key, row);
      }
      if (!row.leagues.some((x) => x.id === l.id))
        row.leagues.push({ id: l.id, name: l.name, starter: !!p.slot });
    }
  return [...rows.values()].sort(
    (a, b) =>
      b.leagues.length - a.leagues.length || a.name.localeCompare(b.name),
  );
}
