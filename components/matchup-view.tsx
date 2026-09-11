'use client';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Flag,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PlayerScore from './player-score';
import { gameLabel, playerPoints } from '@/lib/fantasy/points';
import { isLocked } from '@/lib/fantasy/analysis';
import type { InsightReport } from '@/lib/fantasy/projections';
import type { analyzeMatchup } from '@/lib/fantasy/matchup';

const pts = (value: number | null | undefined) =>
  value == null ? '—' : value.toFixed(1);
const delta = (value: number | null) =>
  value === null ? 'Pending' : `${value > 0 ? '+' : ''}${pts(value)}`;
type Matchup = ReturnType<typeof analyzeMatchup>;
const advantageWidth = (group: Matchup['groups'][number]) =>
  group.edge === null
    ? 50
    : Math.max(
        5,
        Math.min(
          95,
          50 +
            (45 * group.edge) /
              Math.max(
                1,
                Math.abs(group.mine ?? 0),
                Math.abs(group.theirs ?? 0),
              ),
        ),
      );

export default function MatchupView({
  report,
  matchup: m,
  now,
  compact = false,
  onOpen,
}: {
  report: InsightReport;
  matchup: Matchup;
  now: number;
  compact?: boolean;
  onOpen: (view: 'lab' | 'insights' | 'matchup') => void;
}) {
  const { league } = report;
  const gamesFinished =
    m.available && m.progress.mine.allFinal && m.progress.theirs.allFinal;
  const final =
    gamesFinished && league.actual !== null && league.opponent?.actual != null;
  const statusPending = m.progress.mine.pending + m.progress.theirs.pending > 0;
  const editable = (row: Matchup['rows'][number]) =>
    !row.mine || (!isLocked(row.mine, now) && row.mine.locked === false);
  const canChange = m.available && m.rows.some(editable);
  const allLocked =
    m.rows.length > 0 && m.rows.every((r) => r.mine && isLocked(r.mine, now));
  const weakestEditable = m.rows.some(
    (row) => row.slot.label === m.weakest?.label && editable(row),
  );
  const started =
    m.progress.mine.final +
      m.progress.mine.live +
      m.progress.theirs.final +
      m.progress.theirs.live >
    0;
  const live = m.progress.mine.live + m.progress.theirs.live > 0;
  const title = !m.available
    ? 'Matchup unavailable'
    : final
      ? 'The final score is in'
      : gamesFinished
        ? 'Games finished · scores pending'
        : statusPending && !started
          ? 'Waiting for game updates'
          : started
            ? 'Your week, in play'
            : 'Your matchup at a glance';
  const reportedEdge = league.opponent ? m.liveEdge : null;
  const scoreline =
    reportedEdge === null
      ? 'Waiting for reported scores'
      : reportedEdge === 0
        ? 'Currently tied'
        : `${reportedEdge > 0 ? 'You lead' : 'You trail'} by ${pts(Math.abs(reportedEdge))}`;
  const gain = m.lineupGain;
  const teamCards = [
    {
      key: 'mine',
      label: 'Your team',
      name: league.teamName,
      actual: league.actual,
      total: m.submitted,
      progress: m.progress.mine,
    },
    {
      key: 'theirs',
      label: 'Opponent',
      name: league.opponent?.name ?? 'Not scheduled',
      actual: league.opponent?.actual,
      total: m.opposing,
      progress: m.progress.theirs,
    },
  ];
  return (
    <section
      className={`matchup-workspace ${compact ? 'matchup-compact' : ''}`}
      aria-label="Weekly matchup"
      id="matchup-analysis"
      tabIndex={-1}
    >
      <div className="matchup-heading">
        <div>
          <span className="matchup-eyebrow">
            <Trophy size={15} /> WEEK {league.week} MATCHUP
          </span>
          <h2>{title}</h2>
        </div>
        <span
          className={`matchup-phase ${live && m.available ? 'is-live' : ''}`}
        >
          {!m.available
            ? !league.opponent
              ? 'No matchup'
              : 'Unavailable'
            : final
              ? 'Final'
              : gamesFinished
                ? 'Scores pending'
                : statusPending && !started
                  ? 'Status pending'
                  : live
                    ? 'Live games'
                    : started
                      ? 'Week underway'
                      : 'Before kickoff'}
        </span>
      </div>
      {!league.opponent ? (
        <div className="matchup-empty">
          <Flag size={28} />
          <h3>No opponent scheduled</h3>
          <p>
            This league has no verified head-to-head matchup for Week{' '}
            {league.week}.
          </p>
          <Button variant="outline" onClick={() => onOpen('lab')}>
            Review your lineup
          </Button>
        </div>
      ) : (
        <>
          <div className="matchup-scoreboard">
            <div className="scoreboard-topline">
              <span>
                {final ? 'FINAL REPORTED SCORE' : 'POINTS SCORED SO FAR'}
              </span>
              <span>
                {league.platform === 'espn' ? 'ESPN' : 'Sleeper'} ·{' '}
                {league.scoring}
              </span>
            </div>
            <div className="scoreboard-teams">
              {teamCards.map((team) => (
                <div className={`scoreboard-team ${team.key}`} key={team.key}>
                  <span className="scoreboard-team-label">{team.label}</span>
                  <h3>{team.name}</h3>
                  <strong className="scoreboard-points">
                    {pts(team.actual)}
                  </strong>
                  <div className="scoreboard-progress">
                    <span>
                      <Check size={12} />
                      {team.progress.final} final
                    </span>
                    <span className={team.progress.live ? 'live-count' : ''}>
                      {team.progress.live} live
                    </span>
                    <span>{team.progress.upcoming} to play</span>
                    {team.progress.pending > 0 && (
                      <span>{team.progress.pending} pending</span>
                    )}
                  </div>
                </div>
              ))}
              <span className="scoreboard-vs" aria-hidden="true">
                VS
              </span>
            </div>
            <div className="scoreboard-verdict">
              <span>
                {scoreline}
                {final ? ' · final' : ''}
              </span>
              {compact && (
                <button onClick={() => onOpen('matchup')}>
                  Full matchup <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
          {!m.available ? (
            <output className="matchup-status-note">
              <CircleAlert size={18} />
              <span>
                {m.reason} Scores above are the provider’s latest reported
                totals.
              </span>
            </output>
          ) : (
            <>
              <div className="matchup-outlook">
                <div className="matchup-section-title">
                  <div>
                    <span className="matchup-eyebrow">
                      THE POINTS COMPARISON
                    </span>
                    <h3>
                      {final
                        ? 'Your starters’ final points'
                        : started
                          ? 'Scored + yet to play'
                          : 'How the starters stack up'}
                    </h3>
                  </div>
                  <span className="outlook-edge">
                    {delta(m.submittedEdge)} <small>your edge</small>
                  </span>
                </div>
                <div className="outlook-totals">
                  {teamCards.map((team) => (
                    <div key={team.key}>
                      <span>{team.label}</span>
                      <strong>{pts(team.total)}</strong>
                      <small>
                        {gamesFinished
                          ? 'Actual starter points'
                          : started
                            ? 'Actual + upcoming projections'
                            : 'Projected starter points'}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="matchup-explainer">
                  {statusPending && !started
                    ? 'Some game statuses are unconfirmed. Their points stay pending until the provider updates.'
                    : started
                      ? 'Played and live players count their actual points. Only players yet to start count projections; live players can still score.'
                      : 'Both starting lineups use your league provider’s projections and scoring settings.'}
                  {m.submittedEdge === null &&
                    ' A missing score or projection prevents a complete comparison.'}
                </p>
              </div>
              {!compact && (
                <>
                  <div className="matchup-action-strip">
                    <span className="matchup-action-icon">
                      {final ? <Check size={20} /> : <Target size={20} />}
                    </span>
                    <div>
                      <h3>
                        {gamesFinished
                          ? 'This lineup is finished'
                          : allLocked
                            ? 'Your lineup is locked'
                            : !m.lineupComplete
                              ? 'Your lineup comparison needs review'
                              : gain !== null && gain > 0.05
                                ? `There’s ${pts(gain)} more in your lineup`
                                : 'Make your remaining spots count'}
                      </h3>
                      <p>
                        {gamesFinished
                          ? 'Final scores replace projections for every finished starter.'
                          : allLocked
                            ? 'Played players stay in place. Scores update as their games progress.'
                            : !m.lineupComplete
                              ? 'Starter scores still count here. Missing player data or unconfirmed eligibility prevents a complete lineup recommendation; open the lineup for specific checks.'
                              : gain !== null && gain > 0.05
                                ? m.suggestedEdge === null
                                  ? `Your available lineup can improve by ${pts(gain)} points. The opponent comparison is pending their missing scores.`
                                  : `Your best available combination brings the comparison to ${delta(m.suggestedEdge)} points versus this opponent. Played slots stay locked.`
                                : 'Review your available starters and waiver options before their games begin.'}
                      </p>
                    </div>
                    {(canChange || !allLocked) && (
                      <Button onClick={() => onOpen('lab')}>
                        Review lineup <ArrowRight size={16} />
                      </Button>
                    )}
                  </div>
                  <div className="matchup-detail-grid">
                    <section className="matchup-lineups">
                      <div className="matchup-section-title">
                        <div>
                          <span className="matchup-eyebrow">THE STARTERS</span>
                          <h3>Head to head</h3>
                        </div>
                        <span className="score-legend">
                          <i />
                          Live <span>Final</span>
                          <span>Proj.</span>
                        </span>
                      </div>
                      <div className="head-to-head-labels">
                        <span>Your team</span>
                        <span>Slot</span>
                        <span>Opponent</span>
                      </div>
                      <div className="head-to-head-rows">
                        {m.rows.map((row) => (
                          <article
                            className="head-to-head-row"
                            key={row.slot.id}
                          >
                            <section
                              className="matchup-player mine"
                              aria-label={`Your ${row.slot.label} starter`}
                            >
                              <div>
                                <strong>
                                  {row.mine?.name ?? 'Empty slot'}
                                </strong>
                                <span>
                                  {row.mine
                                    ? `${row.mine.team} · ${row.mine.opponent}`
                                    : 'No starter'}
                                </span>
                                <small>
                                  {row.mine ? gameLabel(row.mine, now) : '—'}
                                </small>
                              </div>
                              <PlayerScore player={row.mine} now={now} />
                            </section>
                            <span className="matchup-slot">
                              {row.slot.label}
                            </span>
                            <section
                              className="matchup-player theirs"
                              aria-label={`Opponent’s ${row.slot.label} starter`}
                            >
                              <PlayerScore player={row.theirs} now={now} />
                              <div>
                                <strong>
                                  {row.theirs?.name ?? 'Empty slot'}
                                </strong>
                                <span>
                                  {row.theirs
                                    ? `${row.theirs.team} · ${row.theirs.opponent}`
                                    : 'No starter'}
                                </span>
                                <small>
                                  {row.theirs
                                    ? gameLabel(row.theirs, now)
                                    : '—'}
                                </small>
                              </div>
                            </section>
                          </article>
                        ))}
                      </div>
                    </section>
                    <aside className="matchup-breakdown">
                      <div className="matchup-section-title">
                        <div>
                          <span className="matchup-eyebrow">
                            WHERE IT’S WON
                          </span>
                          <h3>Position advantage</h3>
                        </div>
                      </div>
                      <p className="matchup-explainer">
                        Positive points favor your starters.
                      </p>
                      <div className="matchup-position-list">
                        {m.groups.map((group) => (
                          <div className="matchup-position" key={group.label}>
                            <div>
                              <span>
                                {group.label}
                                {group.count > 1 ? ` × ${group.count}` : ''}
                              </span>
                              <strong
                                className={
                                  group.edge !== null && group.edge > 0
                                    ? 'edge-positive'
                                    : ''
                                }
                              >
                                {delta(group.edge)}
                              </strong>
                            </div>
                            <div className="position-track" aria-hidden="true">
                              <span
                                style={{ width: `${advantageWidth(group)}%` }}
                              />
                            </div>
                            <small>
                              You {pts(group.mine)}{' '}
                              <span>Them {pts(group.theirs)}</span>
                            </small>
                          </div>
                        ))}
                      </div>
                      {m.weakest && !final && (
                        <div className="matchup-waiver-prompt">
                          <Zap size={18} />
                          <p>
                            <strong>
                              {m.weakest.label} is your largest gap
                            </strong>
                            <span>
                              {pts(Math.abs(m.weakest.edge!))} points behind
                              their submitted starters.
                            </span>
                          </p>
                          {weakestEditable && (
                            <Button
                              variant="outline"
                              onClick={() => onOpen('insights')}
                            >
                              Find waiver help <ArrowUpRight size={15} />
                            </Button>
                          )}
                        </div>
                      )}
                      {!!m.threats.length && (
                        <details className="matchup-scoring-details">
                          <summary>Opponent scoring leaders</summary>
                          {m.threats.map((p) => (
                            <p key={p.id}>
                              <span>{p.name}</span>
                              <strong>
                                {pts(playerPoints(p, now).value)}{' '}
                                <small>{playerPoints(p, now).label}</small>
                              </strong>
                            </p>
                          ))}
                        </details>
                      )}
                    </aside>
                  </div>
                  <details className="matchup-method">
                    <summary>About these scores</summary>
                    <p>
                      Actual points replace projections once NFL game status
                      confirms play has started. Final labels require a
                      completed game. Missing scores stay pending. Projections
                      come from {league.source}.
                    </p>
                    <p>
                      The top scorecard shows official team totals. Player
                      comparisons add each starting player once; commissioner
                      adjustments can make those totals differ. This comparison
                      is not a win probability or a forecast of remaining points
                      from live games.
                    </p>
                  </details>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
