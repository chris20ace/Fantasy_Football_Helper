'use client';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Copy,
  LockKeyhole,
  RefreshCw,
  Target,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { analyze, unavailable } from '@/lib/fantasy/analysis';
import { rankWaivers } from '@/lib/fantasy/projections';
import { analyzeMatchup } from '@/lib/fantasy/matchup';
import type { League } from '@/lib/fantasy/types';
import MatchupView from './matchup-view';
import PlayerScore from './player-score';
import LineupDataReview from './lineup-data-review';
import { gameLabel, playerPoints, scoreProgress } from '@/lib/fantasy/points';
import type { LeagueInsightsState } from './use-league-insights';
import { starterTarget } from '@/lib/fantasy/command-center';

const pts = (value: number | null | undefined) =>
  value == null ? '—' : value.toFixed(1);
export default function WeeklyPlan({
  leagues,
  selected,
  onSelect,
  state,
  now,
  blocked,
  onRefresh,
  mode = 'plan',
  onOpen,
}: {
  leagues: League[];
  selected: string;
  onSelect: (id: string) => void;
  state: LeagueInsightsState;
  now: number;
  blocked: boolean;
  onRefresh: () => void;
  mode?: 'plan' | 'lineup' | 'matchup';
  onOpen: (view: 'lab' | 'insights' | 'matchup') => void;
}) {
  const active = leagues.find((l) => l.id === selected) ?? leagues[0];
  const report = state.report;
  const refreshPlan =
    blocked || active?.stale || active?.error ? onRefresh : state.refresh;
  const stale =
    blocked ||
    !!active?.stale ||
    !!active?.error ||
    !report ||
    !Number.isFinite(Date.parse(report.fetchedAt)) ||
    now - Date.parse(report.fetchedAt) > 300000;
  const analysis = useMemo(
    () =>
      report
        ? analyze(
            { ...report.league, stale: stale || report.league.stale },
            now,
          )
        : null,
    [report, stale, now],
  );
  const waivers = useMemo(
    () => (report && !stale ? rankWaivers(report, now) : []),
    [report, stale, now],
  );
  const matchup = useMemo(
    () =>
      report
        ? analyzeMatchup(
            {
              ...report,
              league: { ...report.league, stale: stale || report.league.stale },
            },
            now,
          )
        : null,
    [report, stale, now],
  );
  const [copied, setCopied] = useState('');
  if (!active) return null;
  const moves = analysis?.enabled
    ? (analysis.assignments.filter(
        (r) => r.current?.id !== r.recommended?.id,
      ) ?? [])
    : [];
  const starters =
    analysis?.assignments.filter((r) => !!r.recommended).length ?? 0;
  const picks = waivers
    .filter((p) => p.fills && (p.gain === null || p.gain > 0))
    .slice(0, 3);
  const shownPicks = picks.length ? picks : waivers.slice(0, 3);
  const lineupFinal = analysis
    ? scoreProgress(
        analysis.assignments.map((r) => r.current),
        now,
      ).allFinal
    : false;
  const missingActual = analysis?.review.some((r) => r.kind === 'actual');
  const uncertainLocks = analysis?.review.some((r) => r.kind === 'lock');
  const missingBench =
    analysis?.review.filter((r) => r.kind !== 'lock' && r.slot === 'Bench') ??
    [];
  const allStarterScores =
    analysis?.coverage.starterScores === analysis?.coverage.starterSlots;
  const copy = async () => {
    if (!report || !analysis?.enabled) return;
    try {
      await navigator.clipboard.writeText(
        [
          `${active.name} · Week ${report.league.week} · Sunday Desk recommended lineup`,
          ...analysis.assignments.map(
            (r) =>
              `${r.slot.label}: ${r.recommended?.name ?? 'Empty — needs attention'}${r.locked ? ' (locked)' : ''}`,
          ),
          'Review in your league app. Uses your league provider’s projections and scoring. Missing estimates require manual review.',
        ].join('\n'),
      );
      setCopied('Lineup copied. Apply it in your league app.');
    } catch {
      setCopied('Copy is unavailable. Your full lineup is listed below.');
    }
  };
  return (
    <section className="weekly-plan" aria-label="Weekly team management">
      <div className="team-toolbar">
        <div className="team-select">
          <label id={`team-label-${mode}`} htmlFor={`team-select-${mode}`}>
            Manage your team
          </label>
          <Select value={active.id} onValueChange={(v) => v && onSelect(v)}>
            <SelectTrigger
              id={`team-select-${mode}`}
              aria-labelledby={`team-label-${mode}`}
            >
              <SelectValue>
                {active.name} · {active.platform.toUpperCase()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {leagues.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} · {l.platform.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <a
          className="external-button"
          href={active.url}
          target="_blank"
          rel="noreferrer"
        >
          Open {active.platform === 'espn' ? 'ESPN' : 'Sleeper'}{' '}
          <ArrowUpRight size={16} />
        </a>
      </div>
      {state.error ? (
        <div className="alert error" role="alert">
          <CircleAlert />
          <div>
            <strong>Recommendations could not load</strong>
            <p>{state.error}</p>
          </div>
          <Button onClick={refreshPlan}>Try again</Button>
        </div>
      ) : !report || !analysis || !matchup ? (
        <div className="panel plan-loading" aria-live="polite">
          <RefreshCw className="spin" />
          <div>
            <h2>Building your weekly plan</h2>
            <p>
              Loading provider projections, available players and your opponent.
            </p>
          </div>
        </div>
      ) : (
        <>
          {stale && (
            <div className="alert" aria-live="polite">
              <CircleAlert />
              <p>Recommendations are paused until your league refreshes.</p>
              <Button onClick={refreshPlan}>Refresh plan</Button>
            </div>
          )}
          {mode !== 'matchup' && (
            <>
              <div
                className={`plan-priority ${analysis.currentTotal === null && analysis.recommendedTotal === null ? 'plan-priority-compact' : ''}`}
              >
                <div>
                  <span className="plan-kicker">
                    <Target size={16} /> SUNDAY DESK RECOMMENDATION
                  </span>
                  <h2>
                    {!analysis.enabled
                      ? 'Lineup advice is paused'
                      : lineupFinal
                        ? allStarterScores
                          ? 'Your lineup is final'
                          : 'Waiting for final scores'
                        : moves.length
                          ? `${moves.length} ${moves.length === 1 ? 'slot change' : 'slot changes'} to review`
                          : analysis.complete
                            ? 'Your best projected lineup is already set'
                            : missingActual
                              ? 'Waiting for player scores'
                              : uncertainLocks
                                ? 'Lineup eligibility needs confirmation'
                                : allStarterScores && missingBench.length
                                  ? `${missingBench.length} bench ${missingBench.length === 1 ? 'player couldn’t' : 'players couldn’t'} be compared`
                                  : 'A starting slot needs review'}
                  </h2>
                  <p>
                    {!analysis.enabled
                      ? analysis.reasons[0]
                      : lineupFinal
                        ? allStarterScores
                          ? 'Your starters have finished. Their actual points are shown below.'
                          : 'Your starters have finished. The missing final scores are identified below; old projections are not substituted.'
                        : analysis.complete
                          ? 'The highest projected legal combination using your league provider’s points, with game locks respected.'
                          : 'We can show the available points, but cannot confirm the best lineup until the checks below are resolved.'}
                  </p>
                </div>
                {(analysis.currentTotal !== null ||
                  analysis.recommendedTotal !== null) && (
                  <div className="plan-totals">
                    <div>
                      <span>Current lineup</span>
                      <strong>{pts(analysis.currentTotal)}</strong>
                    </div>
                    <ArrowRight aria-hidden="true" size={18} />
                    <div>
                      <span>
                        {analysis.complete ? 'Recommended' : 'Evaluated lineup'}
                      </span>
                      <strong>
                        {analysis.enabled
                          ? pts(analysis.recommendedTotal)
                          : '—'}
                      </strong>
                    </div>
                    <div className="plan-gain">
                      <span>Potential gain</span>
                      <strong>
                        {analysis.enabled && analysis.gain !== null
                          ? `${analysis.gain > 0 ? '+' : ''}${pts(analysis.gain)}`
                          : 'Pending'}
                      </strong>
                    </div>
                  </div>
                )}
                <LineupDataReview analysis={analysis} now={now} />
                <small>
                  {analysis.currentTotal === null &&
                  analysis.recommendedTotal === null
                    ? 'Some starter scores or projections are missing, so totals are pending.'
                    : 'Actual points for played and live games + projections for upcoming games. Live players can still score.'}{' '}
                  · {report.league.scoring} · {report.league.source}
                </small>
              </div>
              <div
                className={
                  mode === 'plan' ? 'plan-actions-grid' : 'plan-lineup-focus'
                }
              >
                <section
                  className="panel recommended-lineup"
                  id="recommended-lineup"
                  tabIndex={-1}
                >
                  <div className="section-head">
                    <div>
                      <h2>
                        {mode === 'lineup'
                          ? analysis.enabled
                            ? 'Your recommended starting lineup'
                            : 'Your roster reference'
                          : 'Start here: set your lineup'}
                      </h2>
                      <p className="muted">
                        {starters} / {report.league.slots.length} slots filled ·{' '}
                        {`${analysis.coverage.starterScores} / ${analysis.coverage.starterSlots} starter scores available`}
                        {analysis.issues.length > 0 &&
                          ` · ${analysis.issues.length} lineup alerts`}
                      </p>
                    </div>
                    {mode === 'lineup' && (
                      <Button
                        variant="outline"
                        onClick={copy}
                        disabled={!analysis.enabled}
                      >
                        <Copy size={16} />
                        Copy lineup
                      </Button>
                    )}
                  </div>
                  {mode === 'plan' ? (
                    <>
                      {moves.length ? (
                        <ol className="move-list">
                          {moves.slice(0, 4).map((row) => (
                            <li key={row.slot.id}>
                              <span className="slot-badge">
                                {row.slot.label}
                              </span>
                              <div>
                                <strong>
                                  {row.recommended
                                    ? `Start ${row.recommended.name}`
                                    : 'Fill this empty slot'}
                                </strong>
                                <p>
                                  {row.current
                                    ? `Currently: ${row.current.name}`
                                    : 'Currently empty'}
                                  {row.recommended
                                    ? ` · ${pts(row.recommended.projection)} projected pts`
                                    : ''}
                                </p>
                              </div>
                              <ArrowRight aria-hidden="true" size={16} />
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <div className="plan-no-moves">
                          {analysis.complete ? <Check /> : <CircleAlert />}
                          <p>
                            {analysis.complete
                              ? lineupFinal
                                ? 'All starters have finished. Their actual points are shown below.'
                                : 'Keep your current starters. Check injuries again before kickoff.'
                              : analysis.enabled
                                ? 'No changes confirmed. Review the named player checks above before changing your lineup.'
                                : 'Choose the current week and refresh to get lineup recommendations.'}
                          </p>
                        </div>
                      )}
                      {moves.length > 4 && (
                        <p className="muted">
                          Plus {moves.length - 4} more slot changes. Apply the
                          full combination together.
                        </p>
                      )}
                      <Button
                        className="plan-main-button"
                        onClick={() => onOpen('lab')}
                      >
                        See full recommended lineup <ArrowRight size={16} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <ol className="starting-lineup">
                        {analysis.assignments.map((row) => {
                          const p = row.recommended;
                          const changed =
                            analysis.enabled && row.current?.id !== p?.id;
                          const needsReview =
                            !p ||
                            unavailable(p) ||
                            playerPoints(p, now).value === null ||
                            p.locked === null;
                          const monitor =
                            !!p &&
                            /QUESTIONABLE|DOUBTFUL|DAY_TO_DAY/i.test(p.injury);
                          return (
                            <li
                              id={
                                row.current
                                  ? starterTarget(row.current.id)
                                  : undefined
                              }
                              tabIndex={-1}
                              className={changed ? 'lineup-change' : ''}
                              key={row.slot.id}
                            >
                              <span className="slot-badge">
                                {row.slot.label}
                              </span>
                              <div>
                                <strong>{p?.name ?? 'Empty slot'}</strong>
                                <span className="starter-meta">
                                  {p
                                    ? `${p.position} · ${p.team} ${p.opponent}`
                                    : 'Find an eligible player'}
                                </span>
                                <span
                                  className={`starter-decision ${changed ? 'change' : ''}`}
                                >
                                  {row.locked ? (
                                    <>
                                      <LockKeyhole size={13} />
                                      Locked in place
                                    </>
                                  ) : !analysis.enabled ? (
                                    'Reference only'
                                  ) : changed ? (
                                    'Recommended change'
                                  ) : needsReview ? (
                                    'Held · review needed'
                                  ) : monitor ? (
                                    'Monitor before kickoff'
                                  ) : (
                                    'Keep starting'
                                  )}
                                </span>
                                {changed && (
                                  <p className="starter-from">
                                    {row.current
                                      ? `Currently: ${row.current.name}`
                                      : 'Fills an empty slot'}
                                  </p>
                                )}
                                {p && <small>{gameLabel(p, now)}</small>}
                                {p && unavailable(p) && (
                                  <small className="starter-alert">
                                    {p.bye
                                      ? 'Bye week'
                                      : `Unavailable · ${p.injury}`}
                                  </small>
                                )}
                                {p && monitor && (
                                  <small className="starter-alert">
                                    Monitor · {p.injury.replaceAll('_', ' ')}
                                  </small>
                                )}
                              </div>
                              <div className="starter-points">
                                <PlayerScore player={p} now={now} />
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                      {copied && (
                        <p aria-live="polite" className="muted">
                          {copied}
                        </p>
                      )}
                      <a
                        className="plan-apply"
                        href={active.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {analysis.enabled
                          ? 'Review & apply in'
                          : 'Open roster in'}{' '}
                        {active.platform === 'espn' ? 'ESPN' : 'Sleeper'}{' '}
                        <ArrowUpRight size={17} />
                      </a>
                      <p className="muted">
                        {analysis.enabled
                          ? 'Apply the entire combination, including FLEX moves. Sunday Desk does not submit lineup changes.'
                          : 'This is a roster reference. Choose the current week and refresh to resume recommendations.'}
                      </p>
                      <details className="plan-evidence">
                        <summary>
                          Lineup alerts & data checks (
                          {analysis.issues.length + analysis.review.length})
                        </summary>
                        {analysis.issues.map((i, index) => (
                          <p key={index}>
                            <strong>{i.player?.name ?? i.slot}:</strong>{' '}
                            {i.reason}
                          </p>
                        ))}
                        {analysis.reasons.map((r) => (
                          <p key={r}>{r}</p>
                        ))}
                        <p>
                          Actuals and projections come from{' '}
                          {report.league.source} under this league’s scoring.
                          Missing estimates and unknown locks stay held for
                          review. Actual results can differ.
                        </p>
                      </details>
                    </>
                  )}
                </section>
                {mode === 'plan' && (
                  <section className="panel priority-waivers">
                    <div className="section-head">
                      <div>
                        <h2>Waiver moves to consider</h2>
                        <p className="muted">
                          {picks.length
                            ? 'Prioritized for your starting lineup'
                            : 'Depth options and available coverage'}
                        </p>
                      </div>
                      <Zap size={22} />
                    </div>
                    {shownPicks.length ? (
                      <ol className="priority-picks">
                        {shownPicks.map((pick) => (
                          <li key={pick.player.id}>
                            <div>
                              <strong>{pick.player.name}</strong>
                              <span>
                                {pick.player.position} · {pick.player.team} ·{' '}
                                {pick.player.availability}
                              </span>
                            </div>
                            <b>
                              {pick.gain !== null && pick.gain > 0
                                ? `+${pts(pick.gain)} pts`
                                : pick.fills
                                  ? 'Starting option'
                                  : 'Depth only'}
                            </b>
                            <p>{pick.reason}</p>
                            <small>
                              {pts(pick.player.projection)} projected pts ·{' '}
                              {gameLabel(pick.player, now)}
                            </small>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted">
                        {!report.ownershipVerified
                          ? 'League ownership could not be verified. Refresh before considering an addition.'
                          : !analysis.enabled
                            ? 'Waiver advice is paused for this view.'
                            : 'No supported waiver additions are available right now.'}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      className="plan-main-button"
                      onClick={() => onOpen('insights')}
                    >
                      Review waiver additions <ArrowRight size={16} />
                    </Button>
                    <p className="waiver-footnote">
                      Gains are alternatives, not additive. Check required
                      drops, claim timing and budget in your league.
                    </p>
                  </section>
                )}
              </div>
            </>
          )}
          {(mode === 'plan' || mode === 'matchup') && (
            <MatchupView
              report={report}
              matchup={matchup}
              now={now}
              compact={mode === 'plan'}
              onOpen={onOpen}
            />
          )}{' '}
        </>
      )}
    </section>
  );
}
