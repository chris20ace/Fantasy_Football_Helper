'use client';
import { useMemo } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { analyze } from '@/lib/fantasy/analysis';
import { rankWaivers } from '@/lib/fantasy/projections';
import type { LeagueInsightsState } from './use-league-insights';
import type { League } from '@/lib/fantasy/types';
import RosterConstruction from './roster-construction';

const pts = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1));

export default function Insights({
  leagues,
  selected,
  onSelect,
  week,
  now,
  blocked,
  state,
  onLineup,
  onRefresh,
}: {
  leagues: League[];
  selected: string;
  onSelect: (id: string) => void;
  week: number;
  now: number;
  blocked: boolean;
  state: LeagueInsightsState;
  onLineup: () => void;
  onRefresh: () => void;
}) {
  const active = leagues.find((l) => l.id === selected) ?? leagues[0];
  const { report, error, loading } = state;
  const refresh =
    blocked || active?.stale || active?.error ? onRefresh : state.refresh;
  const valid =
    report?.projectionSource === 'provider' &&
    report.league.id === active?.id &&
    report.league.week === week
      ? report
      : null;
  const stale =
    blocked ||
    !!active?.stale ||
    !!active?.error ||
    !valid ||
    !Number.isFinite(Date.parse(valid.fetchedAt)) ||
    now - Date.parse(valid.fetchedAt) > 300000;
  const analysis = useMemo(
    () =>
      valid
        ? analyze({ ...valid.league, stale: stale || valid.league.stale }, now)
        : null,
    [valid, stale, now],
  );
  const waivers = useMemo(
    () => (valid && !stale ? rankWaivers(valid, now) : []),
    [valid, stale, now],
  );
  if (!active)
    return (
      <div className="panel insight-empty">
        Connect a league to find available players.
      </div>
    );
  const provider = active.platform === 'espn' ? 'ESPN' : 'Sleeper';
  return (
    <div className="insights-workspace">
      <div className="insight-toolbar">
        <Select value={active.id} onValueChange={(v) => v && onSelect(v)}>
          <SelectTrigger aria-label="League for waiver suggestions">
            <SelectValue>{active.name}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {leagues.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} · {l.platform}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>{active.scoring}</span>
        <Button variant="outline" disabled={loading} onClick={refresh}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          Refresh waivers
        </Button>
      </div>
      {loading && (
        <div className="panel insight-empty" aria-live="polite">
          <RefreshCw className="spin" size={28} />
          <h2>Loading available players</h2>
          <p>
            Checking {provider} projections, league rosters and possible lineup
            upgrades.
          </p>
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}
      {valid && analysis && (
        <>
          {stale && (
            <div className="alert" aria-live="polite">
              Refresh waivers before acting. These figures are a previous
              snapshot.
            </div>
          )}
          <RosterConstruction
            report={valid}
            analysis={analysis}
            stale={stale}
            now={now}
            onLineup={onLineup}
          />
          <section id="waiver-shortlist" className="panel insight-section">
            <div className="insight-section-head">
              <div>
                <div className="eyebrow">THE PICKUP SHORTLIST</div>
                <h2>Who could improve your lineup?</h2>
                <p>
                  {valid.evaluated} unrostered candidates checked ·{' '}
                  {valid.league.source} · Week {week}
                </p>
              </div>
              <a
                className="text-link"
                href={active.url}
                target="_blank"
                rel="noreferrer"
              >
                Open {provider}
                <ArrowUpRight size={16} />
              </a>
            </div>
            <p className="insight-caution">
              Ranked using provider projections under this league’s scoring.
              Potential gain measures the improvement over your best available
              lineup, including your bench.
            </p>
            {waivers.length ? (
              <div className="waiver-grid">
                {waivers.slice(0, 6).map((pick, i) => (
                  <article className="waiver-card" key={pick.player.id}>
                    <div className="waiver-rank">
                      <span>#{String(i + 1).padStart(2, '0')}</span>
                      <span>{pick.player.availability}</span>
                    </div>
                    <h3>{pick.player.name}</h3>
                    <div className="insight-player-meta">
                      {pick.player.position} · {pick.player.team} ·{' '}
                      {pick.player.opponent || 'Schedule unconfirmed'}
                      {pick.player.injury &&
                        pick.player.injury !== 'ACTIVE' && (
                          <b> · {pick.player.injury.replaceAll('_', ' ')}</b>
                        )}
                    </div>
                    <div className="waiver-values">
                      <div>
                        <b>{pts(pick.player.projection)}</b>
                        <span>{provider} projected pts</span>
                      </div>
                      <div>
                        <b
                          className={
                            pick.gain && pick.gain > 0 ? 'positive' : ''
                          }
                        >
                          {pick.gain == null ? '—' : `+${pts(pick.gain)}`}
                        </b>
                        <span>Potential lineup gain</span>
                      </div>
                    </div>
                    <p>{pick.reason}</p>
                    {pick.player.kickoff !== null && (
                      <small>
                        Kickoff:{' '}
                        {new Date(pick.player.kickoff).toLocaleString([], {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </small>
                    )}
                    {pick.player.waiverDate != null && (
                      <small>
                        Waiver date:{' '}
                        {new Date(pick.player.waiverDate).toLocaleString()}
                      </small>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="insight-empty">
                <h3>No actionable shortlist right now</h3>
                <p>
                  {!valid.ownershipVerified
                    ? 'League ownership could not be fully verified.'
                    : !analysis.enabled
                      ? analysis.reasons[0]
                      : 'No available candidate meets the projection, scoring, eligibility and game-lock checks.'}
                </p>
              </div>
            )}
            <details className="insight-caution">
              <summary>How to use waiver suggestions</summary>
              <p>
                Each addition is an alternative, not a cumulative gain. It
                assumes you can free a roster spot without dropping one of your
                recommended starters. Check required drops, roster limits,
                waiver timing and budget in {provider}; Sunday Desk does not
                submit claims.
              </p>
              <p>
                We compare up to 24 eligible candidates, four per eligibility
                group. Numerical gain requires complete roster projections and
                no more than 10 starter slots. Missing provider projections stay
                unavailable.
              </p>
              {valid.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </details>
            <Button variant="outline" onClick={onLineup}>
              Review your recommended lineup
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
