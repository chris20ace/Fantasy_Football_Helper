'use client';
import { useMemo } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildTeamRosterPlan } from '@/lib/fantasy/team-roster-plan';
import type { RosterMove } from '@/lib/fantasy/team-roster-plan';
import { playerPoints } from '@/lib/fantasy/points';
import { weeklyBackup } from '@/lib/fantasy/roster-construction';
import { moveTarget } from '@/lib/fantasy/command-center';
import type { InsightReport } from '@/lib/fantasy/projections';

const points = (n: number | null) => (n === null ? 'Pending' : n.toFixed(1));
const delta = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
const kindLabel = {
  repair: 'Fill a starting gap',
  upgrade: 'Upgrade a starter',
  depth: 'Strengthen your bench',
  bye: 'Fix bye coverage',
  stream: 'Optional streaming move',
};

function MoveCard({
  move,
  report,
  before,
  onProtect,
}: {
  move: RosterMove;
  report: InsightReport;
  before: number | null;
  onProtect: (id: string) => void;
}) {
  const { add, drop, starts, depth, depthLoss } = move;
  const future = ['keeper', 'dynasty', 'unknown'].includes(
    report.league.rosterRules?.format ?? 'unknown',
  );
  return (
    <article className="team-move" id={moveTarget(move.add.id)} tabIndex={-1}>
      <div className="team-move-top">
        <span className="team-label">{kindLabel[move.kind]}</span>
        <span className="team-gain">
          {move.coverage > 0
            ? `+${move.coverage} covered slot${move.coverage > 1 ? 's' : ''}`
            : move.kind === 'depth'
              ? 'Depth upgrade'
              : move.kind === 'bye'
                ? `Week ${move.byeHelp.join(', ')}`
                : `${delta(move.gain)} pts`}
        </span>
      </div>
      <h3>
        {drop ? 'Compare' : 'Add'} {add.name}
        {drop ? <> for {drop.name}</> : ''}
      </h3>
      <div className="team-transaction">
        <div>
          <span>
            ADD · {add.position} · {add.team}
          </span>
          <strong>{add.name}</strong>
          <small>
            {points(add.projection)} projected ·{' '}
            {add.availability ?? 'Check claim timing'}
          </small>
        </div>
        <ArrowRight size={18} aria-hidden="true" />
        <div>
          <span>{drop ? 'POSSIBLE DROP' : 'ROSTER SPACE'}</span>
          <strong>{drop?.name ?? 'Use an open place'}</strong>
          <small>
            {drop
              ? `${drop.position} · ${points(drop.projection)} projected`
              : 'No active player removed'}
          </small>
        </div>
      </div>
      {starts && (
        <p>
          <strong>Start at {starts.slot.label}:</strong>{' '}
          {starts.replaces ? (
            <>
              {add.name} replaces {starts.replaces.name} (
              {points(starts.replaces.projection)} projected).
            </>
          ) : (
            <>Fills a slot your available roster cannot cover.</>
          )}
        </p>
      )}
      {move.kind === 'depth' && depth && (
        <p>
          <strong>If {depth.starter.name} cannot play:</strong>{' '}
          {depth.afterNames.join(' + ') || add.name} gives you{' '}
          {depth.coverage > 0
            ? 'an additional covered starting slot'
            : `${delta(depth.gain)} more remaining lineup points`}{' '}
          after this swap.{' '}
          {depth.beforeNames.length
            ? `Current fallback: ${depth.beforeNames.join(' + ')}.`
            : 'You currently have no available replacement for that gap.'}
        </p>
      )}
      <div className="team-move-score">
        <span>
          {before === null || move.after.total === null
            ? 'Change in remaining lineup points'
            : 'Best lineup after the full add + drop'}
        </span>
        <strong>
          {before !== null && move.after.total !== null ? (
            <>
              {points(before)} <ArrowRight size={15} />{' '}
              {points(move.after.total)}
            </>
          ) : (
            <>{delta(move.gain)} projected pts</>
          )}
        </strong>
      </div>
      {move.gain > 0.0001 && move.gain < 1 && (
        <p className="team-note">
          Small edge: less than one projected point. It may not justify using a
          claim or budget.
        </p>
      )}
      {move.kind === 'depth' && (
        <p className="team-note">
          No starting-lineup gain this week. This comparison improves a specific
          backup role.
        </p>
      )}
      {move.byeHelp.length > 0 && (
        <p>
          <CalendarDays size={15} aria-hidden="true" /> Improves confirmed
          position coverage in Week {move.byeHelp.join(', ')} after the drop.
          This is bye eligibility, not a future point forecast.
        </p>
      )}
      {depthLoss && (depthLoss.coverage < 0 || depthLoss.gain < -0.05) && (
        <p className="team-tradeoff">
          <strong>What you give up:</strong> if {depthLoss.starter.name} cannot
          play,{' '}
          {depthLoss.coverage < 0
            ? 'this swap leaves fewer starting slots covered'
            : `backup protection falls by ${points(-depthLoss.gain)} projected points`}
          .
        </p>
      )}
      {move.byeHarm.length > 0 && (
        <p className="team-tradeoff">
          <strong>Bye tradeoff:</strong> reduces roster coverage in Week{' '}
          {move.byeHarm.join(', ')}.
        </p>
      )}
      {drop && (
        <div className="team-keep-row">
          <p className="team-note">
            {future
              ? `Review ${drop.name}’s keeper, dynasty or trade value before releasing them. Weekly points do not measure that value.`
              : 'This is a weekly roster comparison; check longer-term value before releasing this player.'}
          </p>
          <Button variant="outline" onClick={() => onProtect(drop.id)}>
            <ShieldCheck size={15} />
            Keep {drop.name}
          </Button>
        </div>
      )}
      {add.waiverDate != null && (
        <small>
          Waivers process{' '}
          {new Date(add.waiverDate).toLocaleString([], {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}
          .
        </small>
      )}
    </article>
  );
}

export default function RosterConstruction({
  report,
  stale,
  now,
  onLineup,
  protectedIds,
  onProtect,
}: {
  report: InsightReport;
  stale: boolean;
  now: number;
  onLineup: () => void;
  protectedIds: string[];
  onProtect: (id: string) => void;
}) {
  const plan = useMemo(
    () =>
      buildTeamRosterPlan(
        {
          ...report,
          league: { ...report.league, stale: stale || report.league.stale },
        },
        now,
        protectedIds,
      ),
    [report, stale, now, protectedIds],
  );
  const { league } = report;
  const provider = league.platform === 'espn' ? 'ESPN' : 'Sleeper';
  const primary = plan.upgrades[0] ?? plan.depthMoves[0];
  const visibleMoves = new Set(
    [...plan.upgrades, ...plan.depthMoves, ...plan.streams].map(
      (m) => m.add.id,
    ),
  );
  const otherMoves = plan.allMoves.filter((m) => !visibleMoves.has(m.add.id));
  const newStarters = plan.repairs.filter(
    (a) => !plan.repairs.some((b) => b.current?.id === a.recommended?.id),
  );
  const focus = plan.reason
    ? 'Your roster needs a check'
    : newStarters.length
      ? 'Improve your lineup with players you own'
      : primary?.kind === 'repair'
        ? 'Cover your starting gap first'
        : primary?.kind === 'upgrade'
          ? `Improve at ${primary.starts?.slot.label ?? primary.add.position}`
          : primary
            ? 'Put your bench to better use'
            : 'Keep your core lineup together';
  const renderMove = (move: RosterMove) => (
    <MoveCard
      key={move.add.id}
      move={move}
      report={report}
      before={plan.baseline.total}
      onProtect={onProtect}
    />
  );
  const qbCount = league.players.filter(
    (p) => p.position === 'QB' && !p.reserve && !p.taxi,
  ).length;
  const qbSlots = league.slots.filter((s) => s.label === 'QB').length;
  const sf = league.slots.some((s) => s.label === 'SUPERFLEX');
  return (
    <div className="team-plan">
      <section className="team-plan-hero" aria-labelledby="team-plan-title">
        <div className="team-plan-heading">
          <div>
            <div className="eyebrow">
              <Target size={17} /> YOUR TEAM’S ROSTER PLAN · WEEK {league.week}
            </div>
            <h2 id="team-plan-title">{focus}</h2>
            <p>
              {league.teamName} · {league.name}
            </p>
          </div>
          <span className="team-format">
            {sf ? 'Superflex' : qbSlots === 1 ? '1 QB' : `${qbSlots} QB slots`}
            {league.rosterRules?.format &&
            league.rosterRules.format !== 'unknown'
              ? ` · ${league.rosterRules.format}`
              : ''}
          </span>
        </div>
        <p className="team-focus">
          {plan.reason ||
            (newStarters.length
              ? `${newStarters.map((a) => a.recommended!.name).join(' and ')} can help before you spend a waiver claim.`
              : primary
                ? `${primary.add.name}${primary.drop ? ` for ${primary.drop.name}` : ''} is the leading ${primary.kind === 'depth' || primary.kind === 'bye' ? 'roster-depth comparison' : 'lineup comparison'} among checked players.`
                : `No checked offensive pickup improves your best lineup after making roster space. ${plan.streams.length ? 'Optional kicker or defense changes are below.' : 'Keep the useful coverage you already own.'}`)}
        </p>
        <div className="team-plan-stats">
          <div>
            <span>Current lineup</span>
            <strong>{points(plan.analysis.currentTotal)}</strong>
          </div>
          <div>
            <span>
              {plan.comparable ? 'Best with your roster' : 'Evaluated lineup'}
            </span>
            <strong>
              {plan.enabled ? points(plan.baseline.total) : 'Paused'}
            </strong>
          </div>
          <div>
            <span>Active roster</span>
            <strong>
              {plan.active}
              <small> / {plan.capacity ?? '?'}</small>
            </strong>
          </div>
        </div>
        <div className="team-hero-footer">
          <span>
            Actual scores for live/played players + {provider} projections for
            upcoming games.
          </span>
          <Button variant="outline" onClick={onLineup}>
            Review lineup <ArrowRight size={16} />
          </Button>
        </div>
      </section>
      {plan.repairs.length > 0 && (
        <section className="panel team-section">
          <div className="team-section-heading">
            <div>
              <div className="eyebrow">FIRST · NO WAIVER CLAIM NEEDED</div>
              <h2>Use the players you already have</h2>
            </div>
            <Check size={22} />
          </div>
          <div className="team-lineup-moves">
            {plan.repairs.map((a) => (
              <div key={a.slot.id}>
                <span className="team-slot">{a.slot.label}</span>
                <div>
                  <strong>{a.recommended!.name}</strong>
                  <p>
                    {a.current
                      ? `Instead of ${a.current.name}`
                      : 'Fill your empty starting slot'}
                  </p>
                </div>
                <span>
                  {points(playerPoints(a.recommended, now).value)}
                  <small>projected</small>
                </span>
              </div>
            ))}
          </div>
          <p className="team-note">
            These assignments work together. Played players stay locked in their
            original slots.
          </p>
        </section>
      )}
      <section id="waiver-shortlist" className="panel team-section">
        <div className="team-section-heading">
          <div>
            <div className="eyebrow">THEN · COMPARE A COMPLETE MOVE</div>
            <h2>Make your starting lineup stronger</h2>
            <p>
              {plan.checked} available players · {plan.comparisons} add/drop
              combinations checked for this team
            </p>
          </div>
          <a
            className="text-link"
            href={league.url}
            target="_blank"
            rel="noreferrer"
          >
            Open {provider}
            <ArrowUpRight size={16} />
          </a>
        </div>
        {plan.upgrades.length ? (
          <div className="team-move-grid">{plan.upgrades.map(renderMove)}</div>
        ) : (
          <div className="team-hold">
            <ShieldCheck size={24} />
            <div>
              <h3>
                {plan.reason
                  ? 'Comparisons are paused'
                  : 'No offensive starter upgrade found'}
              </h3>
              <p>
                {plan.reason ||
                  'Among checked candidates, keep your optimized starters. A high-scoring free agent only helps if the whole add/drop improves your actual lineup.'}
              </p>
            </div>
          </div>
        )}
        <p className="team-note">
          Each card is a separate alternative. Gains cannot be added together,
          and the same player cannot fund two drops. Confirm drop eligibility,
          claim timing, roster restrictions and cost in {provider}; Sunday Desk
          does not submit transactions.
          {plan.free === null
            ? ' Active capacity was not supplied; named swaps remain conditional on roster limits.'
            : ''}
        </p>
      </section>
      {plan.depthMoves.length > 0 && (
        <section className="panel team-section">
          <div className="team-section-heading">
            <div>
              <div className="eyebrow">BUILD A MORE USEFUL BENCH</div>
              <h2>Cover a specific weakness</h2>
              <p>
                These moves have a job: a named injury fallback or a dated bye
                gap.
              </p>
            </div>
            <Users size={23} />
          </div>
          <div className="team-move-grid">
            {plan.depthMoves.map(renderMove)}
          </div>
        </section>
      )}
      <div className="team-roster-columns">
        <section className="panel team-section">
          <div className="team-section-heading">
            <div>
              <div className="eyebrow">YOUR OWN CONTINGENCY PLAN</div>
              <h2>If a starter can’t play</h2>
            </div>
          </div>
          {plan.contingencies.length ? (
            <div className="team-fallbacks">
              {plan.contingencies.map((c) => (
                <div key={c.starter.id}>
                  <div>
                    <strong>{c.starter.name}</strong>
                    {/QUESTIONABLE|DOUBTFUL|DAY_TO_DAY/i.test(
                      c.starter.injury,
                    ) && (
                      <span className="team-monitor">
                        {c.starter.injury.replaceAll('_', ' ')}
                      </span>
                    )}
                  </div>
                  <p>
                    {c.replacements.length ? (
                      <>
                        Use <strong>{c.replacements.join(' + ')}</strong>.
                      </>
                    ) : (
                      'No unused available player steps into the lineup.'
                    )}{' '}
                    {c.fallback.missing.length > 0
                      ? `${c.fallback.missing.length} starting slot${c.fallback.missing.length > 1 ? 's remain' : ' remains'} uncovered.`
                      : `Remaining lineup loses ${points(c.loss)} projected points.`}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p>
              {plan.reason ||
                'All starters are already locked or no offensive fallback can be evaluated.'}
            </p>
          )}
          <p className="team-note">
            Each absence is tested separately with flexible slots rearranged.
            This does not predict an injury or assume one backup can cover two
            absences.
          </p>
        </section>
        <section className="panel team-section">
          <div className="team-section-heading">
            <div>
              <div className="eyebrow">NEXT FOUR WEEKS</div>
              <h2>Plan around your byes</h2>
            </div>
            <CalendarDays size={23} />
          </div>
          {plan.byes.length ? (
            <div className="team-byes">
              {plan.byes.map((b) => (
                <div key={b.week} id={`roster-bye-${b.week}`} tabIndex={-1}>
                  <span className="team-slot">W{b.week}</span>
                  <div>
                    <strong>
                      {b.missing
                        ? `${b.missing} slot${b.missing > 1 ? 's' : ''} short`
                        : b.uncertain
                          ? 'Coverage needs a bye check'
                          : 'Covered by your roster'}
                    </strong>
                    <p>
                      {b.absent.length
                        ? `${b.absent.map((p) => p.name).join(', ')} off.`
                        : 'Existing position gap.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No known bye absences in the next four weeks.</p>
          )}
          <p className="team-note">
            Position coverage uses your active roster and confirmed byes. Future
            points, future health and unknown byes are not assumed.
          </p>
        </section>
      </div>
      {plan.streams.length > 0 && (
        <section className="panel team-section">
          <div className="team-section-heading">
            <div>
              <div className="eyebrow">LOWER PRIORITY</div>
              <h2>Kicker & defense streaming</h2>
              <p>
                One best checked alternative per position. Weigh the edge
                against the claim cost.
              </p>
            </div>
          </div>
          <div className="team-move-grid">{plan.streams.map(renderMove)}</div>
        </section>
      )}
      {otherMoves.length > 0 && (
        <section className="panel team-section">
          <details className="team-method">
            <summary>
              All other checked roster comparisons ({otherMoves.length})
            </summary>
            <p>
              These alternatives also appear in your all-league Plan. Each is a
              separate add/drop scenario.
            </p>
            <div className="team-move-grid">{otherMoves.map(renderMove)}</div>
          </details>
        </section>
      )}
      <section className="panel team-section" id="roster-bench">
        <div className="team-section-heading">
          <div>
            <div className="eyebrow">
              ROSTER CONSTRUCTION · APPLIED TO YOUR PLAYERS
            </div>
            <h2>What is each bench spot doing?</h2>
            <p>
              {qbCount} active quarterbacks for {qbSlots} required QB slot
              {qbSlots === 1 ? '' : 's'}
              {sf ? ' plus Superflex' : ''}. Backup value below is measured
              against your next owned alternative.
            </p>
          </div>
          <ShieldCheck size={23} />
        </div>
        <p className="team-note">
          Select Keep to exclude a player from proposed drops. Selections apply
          to this league across Plan and Waivers for this session; they do not
          change your fantasy roster. Protect your keeper or dynasty assets
          here.
        </p>
        <div className="team-bench">
          {plan.bench.map((b) => (
            <div key={b.player.id}>
              <div>
                <strong>{b.player.name}</strong>
                <small>
                  {b.player.position} ·{' '}
                  {points(playerPoints(b.player, now).value)}{' '}
                  {playerPoints(b.player, now).basis === 'actual'
                    ? 'actual'
                    : 'projected'}
                </small>
                <p>
                  {b.protects
                    ? `If ${b.protects.starter.name} is out, keeping ${b.player.name} ${b.protects.coverage > 0 ? `provides eligible cover (${points(b.player.projection)} projected points${b.player.projection === 0 ? '; eligibility only, no expected scoring' : ''})` : `protects ${points(b.protects.points)} lineup points over the next owned alternative`}.`
                    : !plan.comparable
                      ? 'Weekly backup value cannot be confirmed from this snapshot.'
                      : !weeklyBackup(b.player, now)
                        ? 'Unavailable for remaining-week lineup changes.'
                        : 'No improvement in the checked starter-absence scenarios. Review their future role before using this bench spot elsewhere.'}
                  {b.coversByes.length
                    ? ` Also protects Week ${b.coversByes.join(', ')} position coverage.`
                    : ''}
                </p>
              </div>
              <label className="team-protect">
                <input
                  type="checkbox"
                  checked={b.protected}
                  onChange={() => onProtect(b.player.id)}
                />
                <span>Keep</span>
              </label>
            </div>
          ))}
        </div>
        <details className="team-method">
          <summary>Protected starters & comparison details</summary>
          <div className="team-protect-list">
            {league.players
              .filter((p) => !plan.bench.some((b) => b.player.id === p.id))
              .map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={protectedIds.includes(p.id)}
                    onChange={() => onProtect(p.id)}
                  />
                  Keep {p.name}
                </label>
              ))}
          </div>
          <p>
            Scores come from {league.source}. Zero is a valid projection. Locked
            players, IR/taxi places and protected holds are excluded from
            possible drops. ESPN’s reported transaction locks and positive
            position limits are checked when supplied; unknown restrictions
            still require provider confirmation.
          </p>
          <p>
            The bounded search keeps up to 48 candidates across eligible
            positions and different upcoming byes. It maximizes filled legal
            slots, then provider points, with no custom player forecasts. Bench
            suggestions need additional coverage or at least one projected point
            of backup improvement without a material loss elsewhere. Depth
            additions also need at least one provider-projected point.
            Kicker/defense edges under 0.5 points are omitted, and
            injury-designated players are not default drops. Keeper cost, trade
            value and FAAB are not supplied and are not estimated.
          </p>
          {report.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </details>
      </section>
    </div>
  );
}
