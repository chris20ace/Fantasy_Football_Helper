import { isLocked } from './points.ts';
import type { Player } from './types.ts';

// Sleeper requires an AutoSub to be eligible for the starter's roster position:
// https://support.sleeper.com/en/articles/9731991-how-does-player-autosubs-work
// Public REST reads do not expose the assigned pairs. Consider every possible
// shared slot, not just today's slot, since the pair's original slot is unknown.
export function applySleeperAutoSubLocks(
  players: Player[],
  now = Date.now(),
  newPlayerId?: string,
) {
  // A simulated waiver addition cannot have belonged to an existing pair.
  const possibleStartedPartners = players.filter(
    (p) =>
      p.id !== newPlayerId &&
      !p.reserve &&
      !p.taxi &&
      (isLocked(p, now) ||
        (p.locked === null && (!p.autoSubLock || p.kickoff === null))),
  );
  return players.map((p) => {
    if (p.id === newPlayerId || p.reserve || p.taxi || isLocked(p, now))
      return p;
    const possible = possibleStartedPartners.filter(
      (partner) =>
        partner.id !== p.id &&
        (!partner.eligible.length ||
          !p.eligible.length ||
          partner.position === '—' ||
          p.position === '—' ||
          partner.eligible.some((key) => p.eligible.includes(key))),
    );
    if (!possible.length) return p;
    return {
      ...p,
      locked: null,
      autoSubLock: true as const,
      lockReason: `AutoSub eligibility is unconfirmed: this player could be paired with ${possible.map((partner) => partner.name).join(', ')}. Pairings are not available through this connection. Verify in Sleeper before changing the lineup.`,
    };
  });
}
