import type { Analysis } from '@/lib/fantasy/types';
import { playerPoints } from '@/lib/fantasy/points';

export default function LineupDataReview({
  analysis,
  now,
}: {
  analysis: Analysis;
  now: number;
}) {
  if (!analysis.review.length) return null;
  const pointChecks = analysis.review.filter((r) => r.kind !== 'lock');
  const locks = analysis.review.filter((r) => r.kind === 'lock');
  const shown = pointChecks.slice(0, 3);
  const remaining = pointChecks.slice(3);
  const finished = analysis.assignments.flatMap(({ current }) =>
    current?.gameStatus === 'final' && playerPoints(current, now).value !== null
      ? [
          `${current.name}: ${playerPoints(current, now).value!.toFixed(1)} final pts`,
        ]
      : [],
  );
  const renderCheck = (r: Analysis['review'][number]) => (
    <li key={`${r.player.id}:${r.kind}`}>
      <strong>
        {r.player.name} · {r.player.position} · {r.slot}
      </strong>
      <span>{r.reason}</span>
    </li>
  );
  return (
    <div className="lineup-data-review">
      <strong>What needs review</strong>
      <p>
        {analysis.coverage.starterScores === analysis.coverage.starterSlots
          ? `All ${analysis.coverage.starterSlots} starter scores and projections are available. These checks affect the lineup comparison.`
          : `${analysis.coverage.starterScores} of ${analysis.coverage.starterSlots} starting slots have a score or projection.`}
      </p>
      {shown.length > 0 && <ul>{shown.map(renderCheck)}</ul>}
      {locks.length > 0 && (
        <p>
          <strong>
            {locks.length} player{locks.length === 1 ? ' needs' : 's need'} a
            lock check.
          </strong>{' '}
          Their lineup eligibility is unconfirmed. Verify these players in your
          league app before making changes.
        </p>
      )}
      {(remaining.length > 0 || locks.length > 0) && (
        <details>
          <summary>See {remaining.length + locks.length} player checks</summary>
          <ul>{[...remaining, ...locks].map(renderCheck)}</ul>
        </details>
      )}
      {finished.length > 0 && (
        <p className="lineup-confirmed-score">
          <strong>Already counted:</strong> {finished.join('; ')}. Finished
          players stay in their slots and do not need projections.
        </p>
      )}
    </div>
  );
}
