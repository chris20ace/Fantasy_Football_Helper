'use client';

import {
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  buildLeagueCommand,
  PlanDestination,
} from '@/lib/fantasy/command-center';

type LeagueCommand = ReturnType<typeof buildLeagueCommand> & {
  reviewedCount: number;
};
const points = (value: number | null) =>
  value != null && Number.isFinite(value) ? value.toFixed(1) : '—';

export function PlanLeagueCard({
  command: c,
  onNavigate,
  onRetry,
}: {
  command: LeagueCommand;
  onNavigate: (destination: PlanDestination) => void;
  onRetry: (leagueId: string) => void;
}) {
  const { league, actions } = c;
  const first = actions[0];
  const required = actions.filter((action) => !action.optional).length;
  const optional = actions.length - required;
  const attention = c.status === 'attention';
  const planning = c.status === 'planning';
  const state = attention
    ? 'attention'
    : planning
      ? 'planning'
      : c.checking
        ? 'checking'
        : required
          ? 'actions'
          : c.scoresPending
            ? 'scores'
            : optional
              ? 'optional'
              : c.reviewedCount
                ? 'reviewed'
                : 'ready';
  const status =
    state === 'attention'
      ? 'Needs attention'
      : state === 'planning'
        ? league.status === 'pre_draft'
          ? 'Draft pending'
          : league.week < league.currentWeek
            ? 'Past week'
            : league.week > league.currentWeek
              ? 'Future week'
              : 'Planning'
        : state === 'checking'
          ? 'Checking team'
          : state === 'actions'
            ? `${required} to review`
            : state === 'scores'
              ? 'Player scores updating'
              : state === 'optional'
                ? 'Optional ideas'
                : state === 'reviewed'
                  ? 'Reviewed'
                  : 'No actions flagged';
  const StatusIcon = attention
    ? CircleAlert
    : c.checking && !planning
      ? RefreshCw
      : state === 'ready' || state === 'reviewed'
        ? Check
        : Clock3;
  const idleMessage = attention
    ? 'Refresh this league before relying on its recommendations.'
    : planning
      ? league.status === 'pre_draft'
        ? 'Weekly recommendations start after the draft.'
        : 'View this roster for reference. Weekly actions focus on the current week.'
      : c.checking
        ? 'Checking your lineup, available pickups and matchup.'
        : c.scoresPending
          ? 'Some played-player details are still updating.'
          : c.reviewedCount
            ? 'Your current suggestions are in Reviewed items.'
            : !c.plan.enabled
              ? c.plan.reason
              : 'No changes found among the options checked.';

  return (
    <article
      className={`command-league command-card-${state}`}
      id={`command-league-${league.id}`}
      aria-labelledby={`command-league-name-${league.id}`}
      tabIndex={-1}
    >
      <header className="command-card-header">
        <div className="command-card-context">
          <span
            className={`command-provider command-provider-${league.platform}`}
          >
            {league.platform === 'sleeper' ? 'Sleeper' : 'ESPN'}
          </span>
          <span>Week {league.week}</span>
        </div>
        <h3 id={`command-league-name-${league.id}`}>{league.name}</h3>
        <p className="command-card-team">
          <span>Your team</span>
          <strong>{league.teamName}</strong>
        </p>
        <dl className="command-card-facts">
          <div>
            <dt>Season record</dt>
            <dd>{league.record || '—'}</dd>
          </div>
          <div>
            <dt>Scoring</dt>
            <dd>{league.scoring}</dd>
          </div>
        </dl>
      </header>

      {!planning && league.opponent ? (
        <section
          className="command-card-matchup"
          aria-label={`Week ${league.week} score`}
        >
          <div className="command-card-matchup-heading">
            <h4>
              {attention ? 'Last reported score' : `Week ${league.week} score`}
            </h4>
            <span>Actual points</span>
          </div>
          <dl className="command-card-scoreboard">
            <div className="command-card-your-score">
              <dt>You</dt>
              <dd>{points(league.actual)}</dd>
            </div>
            <div>
              <dt>
                <span>Opponent</span>
                <strong>{league.opponent.name}</strong>
              </dt>
              <dd>{points(league.opponent.actual)}</dd>
            </div>
          </dl>
          {(league.actual == null || league.opponent.actual == null) && (
            <p className="command-card-score-note">
              — means the score isn’t available yet.
            </p>
          )}
        </section>
      ) : !planning ? (
        <p className="command-card-no-matchup">
          This week’s opponent isn’t available yet.
        </p>
      ) : null}

      <div className="command-card-review">
        <div className="command-card-status">
          <StatusIcon
            size={16}
            aria-hidden="true"
            className={c.checking && !planning && !attention ? 'spin' : ''}
          />
          <span>{status}</span>
        </div>
        {first ? (
          <button
            className="command-card-next"
            onClick={() => onNavigate(first.destination)}
          >
            <span>
              <small>{first.optional ? 'Optional idea' : 'Next up'}</small>
              <strong>{first.title}</strong>
              <span className="command-card-next-label">{first.label}</span>
            </span>
            <ArrowRight size={19} aria-hidden="true" />
          </button>
        ) : (
          <p className="command-card-idle">{idleMessage}</p>
        )}
        {attention && (
          <Button
            variant="outline"
            className="command-card-retry"
            disabled={c.checking}
            onClick={() => onRetry(league.id)}
          >
            <RefreshCw size={15} className={c.checking ? 'spin' : ''} />
            {c.checking ? 'Refreshing…' : 'Refresh league'}
          </Button>
        )}
        {c.scoresPending && state !== 'scores' && !planning && !attention && (
          <p className="command-card-score-note">
            Some played-player details are still updating.
          </p>
        )}
        {actions.length > 0 && (
          <a
            className="command-queue-link"
            href={`#command-action-${first.id}`}
          >
            <span>
              {required ? `${required} to review` : ''}
              {required && optional ? ' · ' : ''}
              {optional
                ? `${optional} optional ${optional === 1 ? 'idea' : 'ideas'}`
                : ''}
              {c.reviewedCount ? ` · ${c.reviewedCount} reviewed` : ''}
              <small>View in action queue</small>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        )}
      </div>

      <nav
        className="command-league-links"
        aria-label={`Manage ${league.name}`}
      >
        <Button
          variant="ghost"
          onClick={() =>
            onNavigate({
              leagueId: league.id,
              view: 'lab',
              target: 'recommended-lineup',
            })
          }
        >
          Lineup
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            onNavigate({
              leagueId: league.id,
              view: 'insights',
              target: 'team-plan-title',
            })
          }
        >
          Waivers
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            onNavigate({
              leagueId: league.id,
              view: 'matchup',
              target: 'matchup-analysis',
            })
          }
        >
          Matchup
        </Button>
      </nav>
    </article>
  );
}
