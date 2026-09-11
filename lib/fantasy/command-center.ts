import { buildTeamRosterPlan } from './team-roster-plan.ts';
import { analyzeMatchup } from './matchup.ts';
import { isLocked } from './points.ts';
import { actionFingerprint } from './action-decisions.ts';
import type { League } from './types.ts';
import type { InsightEntry } from './insight-queue.ts';

export type PlanDestination = {
  leagueId: string;
  view: 'lab' | 'insights' | 'matchup' | 'sources';
  target?: string;
};
export const moveTarget = (id: string) => `waiver-move-${id}`;
export const starterTarget = (id: string) => `lineup-player-${id}`;
export type PlanOption = {
  name: string;
  detail: string;
  destination: PlanDestination;
};
export type PlanAction = {
  id: string;
  fingerprint: string;
  leagueId: string;
  kind:
    | 'lineup'
    | 'injury'
    | 'data'
    | 'connection'
    | 'waiver'
    | 'depth'
    | 'bye'
    | 'stream'
    | 'matchup';
  priority: number;
  title: string;
  detail: string;
  label: string;
  due: number | null;
  gain: number | null;
  optional: boolean;
  destination: PlanDestination;
  options: PlanOption[];
};
const pts = (n: number) => n.toFixed(1);
const when = (values: (number | null | undefined)[], now: number) => {
  const times = values.filter(
    (n): n is number => n != null && Number.isFinite(n) && n > now,
  );
  return times.length ? Math.min(...times) : null;
};
const fresh = (date: string, now: number) =>
  Number.isFinite(Date.parse(date)) &&
  now - Date.parse(date) <= 300000 &&
  Date.parse(date) <= now + 60000;

export function buildLeagueCommand(
  league: League,
  entry: InsightEntry | undefined,
  now: number,
  blocked = false,
  protectedIds: string[] = [],
) {
  const valid =
    entry?.report &&
    entry.target.id === league.id &&
    entry.report.league.id === league.id &&
    entry.report.league.week === league.week &&
    entry.report.league.season === league.season &&
    entry.report.projectionSource === 'provider'
      ? entry.report
      : null;
  const source = valid?.league ?? league;
  const stale =
    blocked ||
    !!league.error ||
    !!league.stale ||
    !!source.error ||
    !!source.stale ||
    !fresh(valid?.fetchedAt ?? league.fetchedAt, now);
  const report = valid
    ? { ...valid, league: { ...source, stale: stale || source.stale } }
    : {
        projectionSource: 'provider' as const,
        league: { ...source, stale },
        fetchedAt: source.fetchedAt,
        candidates: [],
        evaluated: 0,
        warnings: [],
        ownershipVerified: false,
      };
  const plan = buildTeamRosterPlan(report, now, protectedIds);
  const matchup = analyzeMatchup(report, now);
  const actions: PlanAction[] = [];
  const dest = (
    view: PlanDestination['view'],
    target?: string,
  ): PlanDestination => ({ leagueId: league.id, view, target });
  const add = (
    action: Omit<
      PlanAction,
      | 'leagueId'
      | 'id'
      | 'fingerprint'
      | 'due'
      | 'gain'
      | 'optional'
      | 'options'
    > & {
      key: string;
      review: unknown;
      due?: number | null;
      gain?: number | null;
      optional?: boolean;
      options?: PlanOption[];
    },
  ) => {
    const { key, review, ...rest } = action;
    actions.push({
      leagueId: league.id,
      id: `${league.id}:${key}`,
      fingerprint: actionFingerprint([
        1,
        action.kind,
        action.priority,
        !!action.optional,
        review,
      ]),
      due: null,
      gain: null,
      optional: false,
      options: [],
      ...rest,
    });
  };
  const planning =
    source.status !== 'in_season' || source.week !== source.currentWeek;
  const checking =
    !entry || entry.phase === 'loading' || entry.phase === 'queued';
  const failed =
    entry?.phase === 'error' || (entry?.phase === 'ready' && !valid);
  if (stale || failed || source.error)
    add({
      key: 'connection',
      review:
        league.error || source.error
          ? 'connection-error'
          : stale
            ? 'stale'
            : 'check-failed',
      kind: 'connection',
      priority: 0,
      title:
        league.error || source.error
          ? 'Restore this league connection'
          : stale
            ? 'Refresh this league’s data'
            : 'Finish checking this league',
      detail:
        league.error ||
        source.error ||
        entry?.error ||
        'Current recommendations are paused until fresh data is available.',
      label: 'Review connection',
      destination: dest('sources', `source-${league.id}`),
    });
  if (!planning && !failed && !stale && !source.error && plan.enabled) {
    const editableIssues = plan.analysis.issues.filter(
      (i) =>
        !i.player || (!isLocked(i.player, now) && i.player.locked === false),
    );
    const gaps = editableIssues.filter((i) => !i.reason.startsWith('Monitor'));
    if (plan.repairs.length || gaps.length) {
      const repairs = plan.repairs.map(
        (a) =>
          `${a.slot.label}: ${a.recommended!.name}${a.current ? ` for ${a.current.name}` : ' into the empty slot'}`,
      );
      const urgent = gaps.length > 0;
      add({
        key: 'lineup',
        review: [
          plan.repairs
            .map((a) => [a.slot.id, a.current?.id, a.recommended?.id])
            .sort(),
          gaps.map((g) => [g.slot, g.player?.id, g.reason]).sort(),
        ],
        kind: 'lineup',
        priority: urgent ? 0 : 2,
        title: urgent
          ? `Fix ${gaps.length} starting ${gaps.length === 1 ? 'spot' : 'spots'}`
          : 'Improve your lineup with players you own',
        detail: repairs.length
          ? repairs.join(' · ')
          : gaps
              .map((g) => `${g.player?.name ?? g.slot}: ${g.reason}`)
              .join(' · '),
        due: when(
          [
            ...plan.repairs.flatMap((a) => [
              a.current?.kickoff,
              a.recommended?.kickoff,
            ]),
            ...gaps.map((g) => g.player?.kickoff),
          ],
          now,
        ),
        gain: plan.analysis.gain,
        optional:
          !urgent && plan.analysis.gain != null && plan.analysis.gain < 1,
        label: 'Review full lineup',
        destination: dest('lab', 'recommended-lineup'),
      });
    }
    for (const issue of editableIssues.filter(
      (i) => i.reason.startsWith('Monitor') && i.player,
    )) {
      const contingency = plan.contingencies.find(
        (c) => c.starter.id === issue.player!.id,
      );
      add({
        key: `injury:${issue.player!.id}`,
        review: [
          issue.player!.injury,
          contingency?.replacements,
          contingency?.fallback.missing,
        ],
        kind: 'injury',
        priority: 1,
        title: `Monitor ${issue.player!.name}`,
        detail: `${issue.player!.injury.replaceAll('_', ' ')}. ${contingency?.replacements.length ? `If ruled out, use ${contingency.replacements.join(' + ')}${contingency.fallback.missing.length ? '; a starting gap would still remain' : ''}.` : 'No verified unused replacement fills their role; review your options before kickoff.'}`,
        due: when([issue.player!.kickoff], now),
        label: 'Review player & lineup',
        destination: dest('lab', starterTarget(issue.player!.id)),
      });
    }
    const checks = plan.analysis.review.filter((r) => r.kind !== 'actual');
    if (checks.length)
      add({
        key: 'data',
        review: checks.map((c) => [c.player.id, c.kind]).sort(),
        kind: 'data',
        priority: 1,
        title: `Check ${new Set(checks.map((c) => c.player.id)).size} player ${new Set(checks.map((c) => c.player.id)).size === 1 ? 'record' : 'records'}`,
        detail: checks
          .map(
            (c) =>
              `${c.player.name}: ${c.kind === 'lock' ? 'lineup eligibility unconfirmed' : c.kind === 'projection' ? 'projection not supplied' : 'game status unconfirmed'}`,
          )
          .join(' · '),
        label: 'See exact data checks',
        destination: dest('lab', 'lineup-data-checks'),
      });
  }
  if (valid && !checking && !failed && !stale && !planning) {
    const groups = new Map<string, typeof plan.allMoves>();
    for (const move of plan.allMoves) {
      const group = `${move.kind}:${move.starts?.slot.label ?? move.depth?.starter.id ?? `${move.add.position}:${move.byeHelp.join(',')}`}`;
      groups.set(group, [...(groups.get(group) ?? []), move]);
    }
    for (const [key, moves] of groups) {
      const top = moves[0];
      const label =
        top.kind === 'repair'
          ? 'Fill a starting gap'
          : top.kind === 'upgrade'
            ? `Upgrade at ${top.starts?.slot.label ?? top.add.position}`
            : top.kind === 'stream'
              ? `Compare ${top.add.position === 'DEF' ? 'defense' : 'kicker'} streaming`
              : top.kind === 'bye'
                ? `Add coverage for Week ${top.byeHelp.join(', ')}`
                : `Strengthen cover for ${top.depth?.starter.name ?? top.add.position}`;
      const options = moves.map((move) => ({
        name: `${move.add.name}${move.drop ? ` for ${move.drop.name}` : ' into an open roster spot'}`,
        detail: `${move.coverage > 0 ? `Fills ${move.coverage} starting gap` : move.gain > 0.0001 ? `+${pts(move.gain)} lineup pts` : move.kind === 'depth' ? `Backup for ${move.depth?.starter.name}` : `Week ${move.byeHelp.join(', ')} position cover`}${move.byeHelp.length && move.kind !== 'bye' ? ` · helps Week ${move.byeHelp.join(', ')}` : ''}${move.depthLoss || move.byeHarm.length ? ' · coverage tradeoff to review' : ''}`,
        destination: dest('insights', moveTarget(move.add.id)),
      }));
      add({
        key,
        review: [
          top.add.id,
          top.drop?.id,
          moves
            .map((m) => [
              m.add.id,
              m.drop?.id,
              m.coverage,
              m.byeHelp,
              m.byeHarm,
              m.starts?.slot.id,
              m.starts?.replaces?.id,
              m.depthLoss
                ? [
                    m.depthLoss.starter.id,
                    m.depthLoss.coverage,
                    m.depthLoss.gain < -0.9999,
                    m.depthLoss.before.assignments
                      .map((a) => [a.slot.id, a.player?.id])
                      .sort(),
                    m.depthLoss.after.assignments
                      .map((a) => [a.slot.id, a.player?.id])
                      .sort(),
                  ]
                : null,
            ])
            .sort(),
        ],
        kind:
          top.kind === 'repair' || top.kind === 'upgrade' ? 'waiver' : top.kind,
        priority:
          top.kind === 'repair'
            ? 1
            : top.kind === 'upgrade'
              ? 3
              : top.kind === 'bye'
                ? 5
                : top.kind === 'depth'
                  ? 4
                  : 7,
        title: label,
        detail: options[0].name + ' · ' + options[0].detail,
        label: 'Compare add + drop',
        gain: top.gain,
        due: when(
          moves.flatMap((m) => [
            m.add.waiverDate,
            m.add.kickoff,
            m.drop?.kickoff,
          ]),
          now,
        ),
        optional:
          top.kind === 'stream' || (top.kind === 'upgrade' && top.gain < 1),
        destination: options[0].destination,
        options,
      });
    }
    for (const bye of plan.byes.filter((b) => b.missing || b.uncertain)) {
      add({
        key: `bye:${bye.week}`,
        review: [
          bye.week,
          bye.absent.map((p) => p.id).sort(),
          bye.missing,
          bye.uncertain,
        ],
        kind: 'bye',
        priority: 5,
        title: `Plan for Week ${bye.week} byes`,
        detail: `${bye.absent.map((p) => p.name).join(', ') || 'Roster position coverage'}${bye.absent.length ? ' off. ' : ': '}${bye.missing ? `${bye.missing} starting ${bye.missing === 1 ? 'slot lacks' : 'slots lack'} active roster cover.` : 'Coverage depends on an unconfirmed bye.'}`,
        label: 'Review bye coverage',
        destination: dest('insights', `roster-bye-${bye.week}`),
      });
    }
    if (
      plan.reason &&
      !plan.analysis.review.length &&
      !actions.some((a) => a.kind === 'connection') &&
      !plan.canCompareMoves
    )
      add({
        key: 'roster-check',
        review: plan.reason,
        kind: 'data',
        priority: 2,
        title: 'Review roster restrictions',
        detail: plan.reason,
        label: 'Review roster plan',
        destination: dest('insights', 'team-plan-title'),
      });
    const finished =
      matchup.progress.mine.allFinal && matchup.progress.theirs.allFinal;
    if (
      matchup.available &&
      !finished &&
      matchup.submittedEdge != null &&
      matchup.submittedEdge < 0
    )
      add({
        key: 'matchup',
        review: [source.opponent?.name, matchup.weakest?.label],
        kind: 'matchup',
        priority: 6,
        title: `${pts(-matchup.submittedEdge)} points behind in the matchup outlook`,
        detail: `${source.opponent?.name ?? 'Your opponent'} leads on actual points plus upcoming projections.${matchup.weakest ? ` Biggest current gap: ${matchup.weakest.label}.` : ''} This is not a win probability.`,
        label: 'Analyze this matchup',
        destination: dest('matchup', 'matchup-analysis'),
      });
  }
  actions.sort(comparePlanActions);
  const scoresPending = plan.analysis.review.some((r) => r.kind === 'actual');
  const status =
    stale || failed || source.error
      ? 'attention'
      : planning
        ? 'planning'
        : checking
          ? 'checking'
          : actions.some((a) => !a.optional)
            ? 'actions'
            : scoresPending
              ? 'scores'
              : 'ready';
  const statusLabel =
    status === 'attention'
      ? 'Check connection'
      : status === 'planning'
        ? source.status === 'pre_draft'
          ? 'Predraft · planning'
          : source.week !== source.currentWeek
            ? 'Reference week'
            : 'Planning'
        : status === 'checking'
          ? 'Checking team'
          : status === 'scores'
            ? 'Scores updating'
            : status === 'ready'
              ? 'No required changes found'
              : `${actions.filter((a) => !a.optional).length} decisions to review`;
  return {
    league: source,
    actions,
    status,
    statusLabel,
    checking,
    scoresPending,
    matchup,
    plan,
    complete: !!valid && !checking && !failed && !stale,
  };
}

export function comparePlanActions(a: PlanAction, b: PlanAction) {
  return (
    Number(a.optional) - Number(b.optional) ||
    a.priority - b.priority ||
    (a.due ?? Infinity) - (b.due ?? Infinity) ||
    (b.gain ?? 0) - (a.gain ?? 0) ||
    a.id.localeCompare(b.id)
  );
}
