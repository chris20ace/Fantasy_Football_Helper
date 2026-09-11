import type { Player } from '@/lib/fantasy/types';
import { playerPoints } from '@/lib/fantasy/points';

export default function PlayerScore({
  player,
  now,
}: {
  player: Player | null | undefined;
  now: number;
}) {
  const score = playerPoints(player, now);
  return (
    <span className={`player-score score-${score.basis}`}>
      <b>{score.value === null ? '—' : score.value.toFixed(1)}</b>
      <small>{score.label}</small>
    </span>
  );
}
