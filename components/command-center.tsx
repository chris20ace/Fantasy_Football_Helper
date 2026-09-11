'use client';
import { useMemo } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCheck,
  CircleAlert,
  Clock3,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Target,
  Trophy,
  Zap,
  Check,
  X,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanLeagueCard } from '@/components/plan-league-card';
import {
  buildLeagueCommand,
  comparePlanActions,
} from '@/lib/fantasy/command-center';
import type { PlanAction, PlanDestination } from '@/lib/fantasy/command-center';
import type { InsightEntries, InsightEntry } from '@/lib/fantasy/insight-queue';
import type { League } from '@/lib/fantasy/types';
import {
  actionDecisionKey,
  actionDecisionStatus,
} from '@/lib/fantasy/action-decisions';
import type {
  ActionDecisions,
  ActionDecisionStatus,
} from '@/lib/fantasy/action-decisions';

type DecisionHandler = (
  key: string,
  fingerprint: string,
  status: ActionDecisionStatus | null,
) => void;

const EMPTY: string[] = [];
const icons = {
  lineup: Target,
  injury: CircleAlert,
  data: CircleAlert,
  connection: RefreshCw,
  waiver: Zap,
  depth: ShieldCheck,
  bye: CalendarDays,
  stream: Zap,
  matchup: Trophy,
};
const labels = {
  lineup: 'Lineup',
  injury: 'Injury check',
  data: 'Data check',
  connection: 'Connection',
  waiver: 'Waiver decision',
  depth: 'Bench depth',
  bye: 'Bye planning',
  stream: 'Streaming',
  matchup: 'Matchup',
};
const time = (n: number) =>
  new Date(n).toLocaleString([], {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

function ActionRow({
  action,
  league,
  checking,
  onNavigate,
  onRetry,
  decision,
  canSave,
  onDecision,
}: {
  action: PlanAction;
  league: League;
  checking: boolean;
  onNavigate: (d: PlanDestination) => void;
  onRetry: (id: string) => void;
  decision: ActionDecisionStatus | null;
  canSave: boolean;
  onDecision: DecisionHandler;
}) {
  const Icon = icons[action.kind];
  return (
    <article
      className={`command-action ${action.optional ? 'command-optional' : ''} ${decision ? 'command-reviewed-action' : ''}`}
      id={`command-action-${action.id}`}
    >
      <div className="command-action-top">
        <span className={`command-kind command-kind-${action.kind}`}>
          <Icon size={16} />
          {labels[action.kind]}
        </span>
        {decision ? (
          <span className="command-tag">
            {decision === 'acknowledged' ? 'Acknowledged' : 'Dismissed'}
          </span>
        ) : action.optional ? (
          <span className="command-tag">Optional · small edge</span>
        ) : action.priority === 0 ? (
          <span className="command-tag command-urgent">Address first</span>
        ) : null}
      </div>
      <p className="command-action-league">
        {league.name} <span>· {league.platform.toUpperCase()}</span>
      </p>
      <h3>{action.title}</h3>
      <p className="command-action-detail">{action.detail}</p>
      <div className="command-action-footer">
        <span>
          {action.due ? (
            <>
              <Clock3 size={14} />
              Review before {time(action.due)}
            </>
          ) : (
            'For this team'
          )}
        </span>
        <Button
          onClick={() => onNavigate(action.destination)}
          variant={action.optional ? 'outline' : 'default'}
        >
          {action.label}
          <ArrowRight size={15} />
        </Button>
        {action.kind === 'connection' && (
          <Button
            variant="outline"
            disabled={checking}
            onClick={() => onRetry(league.id)}
          >
            <RefreshCw size={15} className={checking ? 'spin' : ''} />
            Retry
          </Button>
        )}
      </div>
      <div
        className="command-review-controls"
        role="group"
        aria-label={`Review decision: ${action.title}`}
      >
        {decision ? (
          <Button
            variant="outline"
            disabled={!canSave}
            onClick={() =>
              onDecision(
                actionDecisionKey(action, league),
                action.fingerprint,
                null,
              )
            }
          >
            <Undo2 size={15} /> Restore to queue
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={!canSave}
              onClick={() =>
                onDecision(
                  actionDecisionKey(action, league),
                  action.fingerprint,
                  'acknowledged',
                )
              }
            >
              <Check size={15} /> Acknowledge
            </Button>
            <Button
              variant="ghost"
              disabled={!canSave}
              onClick={() =>
                onDecision(
                  actionDecisionKey(action, league),
                  action.fingerprint,
                  'dismissed',
                )
              }
            >
              <X size={15} /> Dismiss
            </Button>
          </>
        )}
      </div>
      {action.options.length > 1 && (
        <details className="command-alternatives">
          <summary>Compare all {action.options.length} alternatives</summary>
          <p>
            Choose one alternative for this decision. Other decisions may need
            the same drop.
          </p>
          {action.options.map((o) => (
            <button
              key={o.destination.target}
              onClick={() => onNavigate(o.destination)}
            >
              <span>
                <strong>{o.name}</strong>
                <small>{o.detail}</small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </details>
      )}
    </article>
  );
}

function createCommandReader() {
  type Cached = {
    league: League;
    entry: InsightEntry | undefined;
    now: number;
    blocked: boolean;
    protectedIds: string[];
    value: ReturnType<typeof buildLeagueCommand>;
  };

  const cache = new Map<string, Cached>();
  return (
    leagues: League[],
    entries: InsightEntries,
    now: number,
    blocked: boolean,
    protectedByLeague: Record<string, string[]>,
  ) => {
    const keep = new Set(leagues.map((l) => l.id));
    for (const id of cache.keys()) if (!keep.has(id)) cache.delete(id);
    return leagues.map((league) => {
      const entry = entries[league.id],
        protectedIds = protectedByLeague[league.id] ?? EMPTY,
        old = cache.get(league.id);
      if (
        old &&
        old.league === league &&
        old.entry === entry &&
        old.now === now &&
        old.blocked === blocked &&
        old.protectedIds === protectedIds
      )
        return old.value;
      const value = buildLeagueCommand(
        league,
        entry,
        now,
        blocked,
        protectedIds,
      );
      cache.set(league.id, {
        league,
        entry,
        now,
        blocked,
        protectedIds,
        value,
      });
      return value;
    });
  };
}

export default function CommandCenter({
  leagues,
  entries,
  now,
  blocked,
  protectedByLeague,
  onNavigate,
  onRetry,
  actionDecisions,
  preferencesReady,
  saving,
  onDecision,
}: {
  leagues: League[];
  entries: InsightEntries;
  now: number;
  blocked: boolean;
  protectedByLeague: Record<string, string[]>;
  onNavigate: (d: PlanDestination) => void;
  onRetry: (id: string) => void;
  actionDecisions: ActionDecisions;
  preferencesReady: boolean;
  saving: boolean;
  onDecision: DecisionHandler;
}) {
  const readCommands = useMemo(() => createCommandReader(), []);
  const rawCommands = useMemo(
    () => readCommands(leagues, entries, now, blocked, protectedByLeague),
    [readCommands, leagues, entries, now, blocked, protectedByLeague],
  );
  const commands = rawCommands.map((c) => {
    const actions = c.actions.filter(
      (a) => !actionDecisionStatus(a, c.league, actionDecisions),
    );
    return {
      ...c,
      actions,
      reviewedCount: c.actions.length - actions.length,
      statusLabel:
        c.status === 'actions'
          ? actions.length
            ? `${actions.length} decisions to review`
            : 'Current decisions reviewed'
          : c.statusLabel,
    };
  });
  const reviewed = rawCommands
    .flatMap((c) =>
      c.actions.flatMap((action) => {
        const decision = actionDecisionStatus(
          action,
          c.league,
          actionDecisions,
        );
        return decision
          ? [{ action, decision, league: c.league, checking: c.checking }]
          : [];
      }),
    )
    .sort((a, b) => comparePlanActions(a.action, b.action));
  const actions = commands.flatMap((c) => c.actions).sort(comparePlanActions);
  const teamsWithDecisions = commands.filter(
    (c) => c.actions.length > 0,
  ).length;
  const checked = commands.filter((c) => c.complete).length;
  const pending = commands.filter((c) => c.checking).length;
  const failures = commands.filter((c) => c.status === 'attention').length;
  const next = actions
    .flatMap((a) => (a.due ? [a.due] : []))
    .sort((a, b) => a - b)[0];
  return (
    <div className="command-center">
      <section className="command-summary" aria-label="All connected leagues">
        <div>
          <Layers3 size={21} />
          <strong>{leagues.length}</strong>
          <span>Connected leagues</span>
        </div>
        <div>
          <Target size={21} />
          <strong>{actions.length}</strong>
          <span>Decisions across {teamsWithDecisions} teams</span>
        </div>
        <div>
          <CheckCheck size={21} />
          <strong>
            {checked}
            <small> / {leagues.length}</small>
          </strong>
          <span>
            Teams checked
            {pending
              ? ` · ${pending} checking`
              : failures
                ? ` · ${failures} need attention`
                : ''}
          </span>
        </div>
        <div>
          <Clock3 size={21} />
          <strong className="command-next">
            {next ? time(next) : 'No deadline'}
          </strong>
          <span>Next decision to review</span>
        </div>
      </section>
      <nav
        className="command-league-index"
        aria-label="Jump to a connected league"
      >
        {commands.map((c) => (
          <a href={`#command-league-${c.league.id}`} key={c.league.id}>
            <span className={`source-dot ${c.league.platform}`} />
            <span>{c.league.name}</span>
            <b>{c.checking ? '…' : c.actions.length}</b>
          </a>
        ))}
      </nav>
      {pending > 0 && (
        <output className="command-scan">
          <RefreshCw size={15} className="spin" />
          Checking every connected team. Available lineup decisions appear as
          each league loads.
        </output>
      )}
      <div className="command-layout">
        <section
          className="command-queue"
          aria-labelledby="command-queue-title"
        >
          <div className="command-section-heading">
            <div>
              <h2 id="command-queue-title">Your action queue</h2>
              <p>
                All leagues, ordered by urgency. Pickups are separate
                comparisons; their gains are not added together.
              </p>
              <p className="command-review-hint">
                Acknowledge or dismiss items to clear your queue. Changed
                recommendations return for review.
              </p>
            </div>
            <span className="command-count">{actions.length}</span>
          </div>
          {!preferencesReady && (
            <p className="command-review-loading" role="status">
              Waiting for saved preferences. If review buttons stay unavailable,
              refresh the page.
            </p>
          )}
          {saving && (
            <p className="command-review-loading" role="status">
              Saving your choice…
            </p>
          )}
          {actions.length ? (
            actions.map((action) => {
              const c = commands.find((c) => c.league.id === action.leagueId)!;
              return (
                <ActionRow
                  key={action.id}
                  action={action}
                  league={c.league}
                  checking={c.checking}
                  onNavigate={onNavigate}
                  onRetry={onRetry}
                  decision={null}
                  canSave={preferencesReady && !saving}
                  onDecision={onDecision}
                />
              );
            })
          ) : (
            <div className="panel command-clear">
              <ShieldCheck size={30} />
              <h3>
                {pending
                  ? 'Your teams are being checked'
                  : reviewed.length
                    ? 'All current decisions reviewed'
                    : commands.every((c) => c.status === 'planning')
                      ? 'Your leagues are in planning mode'
                      : 'No changes flagged across your teams'}
              </h3>
              <p>
                {pending
                  ? 'Waiver comparisons and matchup checks will join the queue as they finish.'
                  : reviewed.length
                    ? 'Your choices are saved below. Reviewing an item does not change your lineup or submit a waiver.'
                    : 'Every connected league is listed here. Open a team for its complete lineup, roster plan or matchup.'}
              </p>
            </div>
          )}
          {reviewed.length > 0 && (
            <details className="command-reviewed">
              <summary>
                Reviewed items <span>{reviewed.length}</span>
              </summary>
              <p>
                Acknowledged and dismissed items for this week. Restore any item
                to put it back in your queue.
              </p>
              {reviewed.map(({ action, decision, league, checking }) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  league={league}
                  checking={checking}
                  onNavigate={onNavigate}
                  onRetry={onRetry}
                  decision={decision}
                  canSave={preferencesReady && !saving}
                  onDecision={onDecision}
                />
              ))}
            </details>
          )}
        </section>
        <aside
          className="command-leagues"
          aria-labelledby="command-leagues-title"
        >
          <div className="command-section-heading">
            <div>
              <h2 id="command-leagues-title">Your leagues</h2>
              <p>Your teams, this week’s scores and what to do next.</p>
            </div>
          </div>
          {commands.map((c) => (
            <PlanLeagueCard
              key={c.league.id}
              command={c}
              onNavigate={onNavigate}
              onRetry={onRetry}
            />
          ))}
        </aside>
      </div>
    </div>
  );
}
