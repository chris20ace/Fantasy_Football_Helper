import type { Analysis, League, Player } from './types';
import { playerPoints, isLocked } from './points.ts';
export { isLocked } from './points.ts';
export const unavailable = (p: Player) =>
  p.gameStatus === 'canceled' ||
  p.gameStatus === 'postponed' ||
  p.bye ||
  /^(OUT|IR|INJURY_RESERVE|SUSPENDED|PUP|DNR|NA)$/i.test(p.injury) ||
  p.reserve ||
  p.taxi;
export function total(
  players: (Player | null)[],
  now = Date.now(),
): number | null {
  const values = players.map((p) => playerPoints(p, now).value);
  return values.some((v) => v === null)
    ? null
    : values.reduce<number>((sum, v) => sum + v!, 0);
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
              reason:
                p.gameStatus === 'canceled'
                  ? 'Game canceled'
                  : p.gameStatus === 'postponed'
                    ? 'Game postponed'
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
  const review: Analysis['review'] = [];
  for (const p of league.players) {
    const slot = league.slots.find((s) => s.id === p.slot);
    // A bench player only affects this week's choices if a compatible slot
    // remains open. Played bench players, reserves and taxi players do not.
    const relevant =
      !!slot ||
      (!unavailable(p) &&
        !isLocked(p, now) &&
        league.slots.some(
          (s, i) =>
            p.eligible.includes(s.key) &&
            (!current[i] || !isLocked(current[i]!, now)),
        ));
    if (!relevant) continue;
    const points = playerPoints(p, now);
    const add = (kind: Analysis['review'][number]['kind'], reason: string) =>
      review.push({ player: p, slot: slot?.label ?? 'Bench', kind, reason });
    if (points.value === null) {
      if (points.basis === 'actual')
        add(
          'actual',
          `${p.gameStatus === 'final' ? 'Final' : 'Live'} points are pending from ${league.platform === 'sleeper' ? 'Sleeper' : 'ESPN'}. This player stays locked; their old projection is not used.`,
        );
      else if (points.label === 'Status pending')
        add(
          'game-status',
          'Game status could not be confirmed. A score is not assumed from kickoff time.',
        );
      else if (!unavailable(p) && (!isLocked(p, now) || slot))
        add(
          'projection',
          `${p.partial ? 'A complete league-scored projection is unavailable' : 'No weekly projection was supplied'} by ${league.platform === 'sleeper' ? 'Sleeper' : 'ESPN'}. ${slot ? 'Kept in place for review.' : 'Not compared for lineup changes.'}`,
        );
    }
    if (p.locked === null && !isLocked(p, now) && (!unavailable(p) || slot))
      add(
        'lock',
        'Lineup eligibility could not be confirmed. Verify the lock in your league app.',
      );
  }
  reasons.push(
    ...review.map((r) => `${r.player.name} · ${r.slot}: ${r.reason}`),
  );
  const pinned = current.map(
    (p) =>
      !!p &&
      (isLocked(p, now) ||
        p.locked === null ||
        (!unavailable(p) && playerPoints(p, now).value === null)),
  );
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
        playerPoints(p, now).basis === 'projection' &&
        playerPoints(p, now).value !== null,
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
  const currentTotal = total(current, now),
    recommendedTotal = total(result, now);
  const complete = enabled && review.length === 0 && recommendedTotal !== null;
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
      complete && currentTotal !== null && recommendedTotal !== null
        ? recommendedTotal - currentTotal
        : null,
    changes: result.filter((p): p is Player => !!p && !existing.has(p.id)),
    removed: current.filter((p): p is Player => !!p && !recommended.has(p.id)),
    issues,
    review,
    coverage: {
      starterScores: current.filter((p) => playerPoints(p, now).value !== null)
        .length,
      starterSlots: current.length,
    },
    complete,
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
