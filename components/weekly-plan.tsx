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
  Trophy,
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
import { analyze, isLocked, unavailable } from '@/lib/fantasy/analysis';
import { rankWaivers } from '@/lib/fantasy/projections';
import { analyzeMatchup } from '@/lib/fantasy/matchup';
import type { League, Player } from '@/lib/fantasy/types';
import type { LeagueInsightsState } from './use-league-insights';

const pts = (value: number | null | undefined) =>
  value == null ? '—' : value.toFixed(1);
const delta = (value: number | null | undefined) =>
  value == null
    ? 'Not enough data'
    : `${value > 0 ? '+' : ''}${pts(value)} pts`;
const gameTime = (p: Player, now: number) =>
  p.bye
    ? 'Bye week'
    : isLocked(p, now)
      ? 'Locked · game started or provider lock'
      : p.kickoff
        ? new Date(p.kickoff).toLocaleString([], {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'Kickoff unconfirmed';

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
  const comparisonLabel = 'Projected';
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
                      : moves.length
                        ? `${moves.length} ${moves.length === 1 ? 'slot change' : 'slot changes'} to review`
                        : analysis.complete
                          ? 'Your best projected lineup is already set'
                          : 'Review your lineup’s missing data'}
                  </h2>
                  <p>
                    {!analysis.enabled
                      ? analysis.reasons[0]
                      : analysis.complete
                        ? 'The highest projected legal combination using your league provider’s points, with game locks respected.'
                        : 'The best supported combination among evaluated players. Players with missing projections or unknown locks stay held for review.'}
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
                      <span>Recommended</span>
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
                          : '—'}
                      </strong>
                    </div>
                  </div>
                )}
                <small>
                  {analysis.currentTotal === null &&
                  analysis.recommendedTotal === null
                    ? 'Some starter estimates are missing, so full-lineup totals are withheld.'
                    : 'Provider projections for whole games; actual scores are shown separately.'}{' '}
                  · {report.league.scoring} · {report.league.source}
                </small>
              </div>
              <div
                className={
                  mode === 'plan' ? 'plan-actions-grid' : 'plan-lineup-focus'
                }
              >
                <section className="panel recommended-lineup">
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
                        {analysis.complete
                          ? 'All roster projections evaluated'
                          : 'Some provider projections are missing'}
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
                              ? 'Keep your current starters. Check injuries again before kickoff.'
                              : analysis.enabled
                                ? 'No supported swaps found. Open your lineup to review held players and missing estimates.'
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
                            p.projection === null ||
                            p.partial ||
                            p.locked === null;
                          const monitor =
                            !!p &&
                            /QUESTIONABLE|DOUBTFUL|DAY_TO_DAY/i.test(p.injury);
                          return (
                            <li
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
                                {p && <small>{gameTime(p, now)}</small>}
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
                                <b>{pts(p?.projection)}</b>
                                <small>projected pts</small>
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
                          Lineup alerts & projection coverage (
                          {analysis.issues.length} alerts)
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
                          Projections come from {report.league.source} under
                          this league’s scoring. Missing estimates and unknown
                          locks stay held for review. Actual results can differ.
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
                              {gameTime(pick.player, now)}
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
            <section className="panel matchup-panel">
              <div className="section-head">
                <div>
                  <span className="plan-kicker">
                    <Trophy size={16} /> THIS WEEK’S MATCHUP
                  </span>
                  <h2>
                    {report.league.teamName}{' '}
                    <span className="matchup-versus">vs</span>{' '}
                    {report.league.opponent?.name ?? 'No scheduled opponent'}
                  </h2>
                </div>
                {mode === 'plan' && (
                  <Button variant="outline" onClick={() => onOpen('matchup')}>
                    Analyze matchup <ArrowRight size={16} />
                  </Button>
                )}
              </div>
              <p className="muted">
                Both teams use {report.league.source} · {report.league.scoring}.
              </p>
              <div className="matchup-numbers">
                <div>
                  <span>Your reported score</span>
                  <b>{pts(report.league.actual)}</b>
                </div>
                <div>
                  <span>Opponent’s reported score</span>
                  <b>{pts(report.league.opponent?.actual)}</b>
                </div>
                <div>
                  <span>
                    Current lineup · {comparisonLabel.toLowerCase()} edge
                  </span>
                  <b
                    className={
                      matchup.submittedEdge !== null &&
                      matchup.submittedEdge > 0
                        ? 'positive'
                        : ''
                    }
                  >
                    {delta(matchup.submittedEdge)}
                  </b>
                </div>
                <div>
                  <span>After recommended changes</span>
                  <b>{delta(matchup.suggestedEdge)}</b>
                </div>
              </div>
              <p className="muted">
                {!matchup.available
                  ? matchup.reason
                  : matchup.submittedEdge === null
                    ? `${comparisonLabel} coverage: you ${matchup.coverage.mine}/${matchup.coverage.slots}, opponent ${matchup.coverage.theirs}/${matchup.coverage.slots}. Missing starter estimates prevent a reliable overall edge.`
                    : `Your current lineup: ${pts(matchup.submitted)} ${comparisonLabel.toLowerCase()} points. Opponent’s submitted lineup: ${pts(matchup.opposing)}. ${matchup.submittedEdge > 0 ? 'You have the projected edge.' : matchup.submittedEdge < 0 ? 'You trail on projected points.' : 'The estimates have this matchup even.'}`}
              </p>
              <p className="matchup-disclaimer">
                {comparisonLabel} estimates cover whole games; they are separate
                from live scores and are not a win probability. The opponent’s
                submitted lineup can change.
              </p>
              {mode === 'matchup' && matchup.available && (
                <>
                  <div className="matchup-takeaways">
                    <div>
                      <strong>Your clearest edge</strong>
                      <p>
                        {matchup.strongest
                          ? `${matchup.strongest.label}: ${delta(matchup.strongest.edge)} versus their submitted starters.`
                          : 'No confirmed positional edge with the available estimates.'}
                      </p>
                    </div>
                    <div>
                      <strong>Where you need help</strong>
                      <p>
                        {matchup.weakest
                          ? `${matchup.weakest.label}: ${delta(matchup.weakest.edge)}. Review lineup and waiver options at this position.`
                          : 'No confirmed positional deficit with the available estimates.'}
                      </p>
                    </div>
                    <div>
                      <strong>Games still to start</strong>
                      <p>
                        You: {matchup.notStarted.mine} starters · Opponent:{' '}
                        {matchup.notStarted.theirs}. Game start does not mean a
                        player has finished.
                      </p>
                    </div>
                  </div>
                  <h3>Position-by-position comparison</h3>
                  <p className="muted">
                    Submitted starters, grouped by lineup slot. Positive values
                    favor your team.
                  </p>
                  <div className="position-edges">
                    {matchup.groups.map((group) => (
                      <article key={group.label}>
                        <strong>
                          {group.label}
                          {group.count > 1 ? ` × ${group.count}` : ''}
                        </strong>
                        <span>
                          You <b>{pts(group.mine)}</b>
                        </span>
                        <span>
                          Them <b>{pts(group.theirs)}</b>
                        </span>
                        <b
                          className={
                            group.edge !== null && group.edge > 0
                              ? 'positive'
                              : ''
                          }
                        >
                          {delta(group.edge)}
                        </b>
                      </article>
                    ))}
                  </div>
                  {!!matchup.threats.length && (
                    <div className="opponent-threats">
                      <h3>Opponent players to watch</h3>
                      {matchup.threats.map((p) => (
                        <p key={p.id}>
                          <strong>{p.name}</strong> · {p.position} ·{' '}
                          {pts(p.projection)} {comparisonLabel.toLowerCase()}{' '}
                          pts · {gameTime(p, now)}
                        </p>
                      ))}
                    </div>
                  )}
                  <details className="plan-evidence">
                    <summary>Compare every starting slot</summary>
                    <div className="matchup-players">
                      {matchup.rows.map((row) => (
                        <article key={row.slot.id}>
                          <span className="slot-badge">{row.slot.label}</span>
                          <div>
                            <small>Your starter</small>
                            <strong>{row.mine?.name ?? 'Empty slot'}</strong>
                            <span>
                              {pts(row.mine?.projection)}{' '}
                              {comparisonLabel.toLowerCase()} pts
                            </span>
                          </div>
                          <div>
                            <small>Opponent’s starter</small>
                            <strong>{row.theirs?.name ?? 'Empty slot'}</strong>
                            <span>
                              {pts(row.theirs?.projection)}{' '}
                              {comparisonLabel.toLowerCase()} pts
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </details>
                  <div className="matchup-actions">
                    <Button onClick={() => onOpen('lab')}>
                      Review recommended lineup <ArrowRight size={16} />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onOpen('insights')}
                    >
                      Find waiver help
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
