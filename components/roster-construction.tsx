'use client';
import { useMemo } from 'react';
import { Layers3, CalendarDays, BookOpen, ArrowDown } from 'lucide-react';
import { buildRosterPlan } from '@/lib/fantasy/roster-construction';
import { playerPoints } from '@/lib/fantasy/points';
import type { InsightReport } from '@/lib/fantasy/projections';
import type { Analysis } from '@/lib/fantasy/types';
import { RosterStrategyGuide } from './roster-strategy-guide';

export default function RosterConstruction({
  report,
  analysis,
  stale,
  now,
  onLineup,
}: {
  report: InsightReport;
  analysis: Analysis;
  stale: boolean;
  now: number;
  onLineup: () => void;
}) {
  const plan = useMemo(
    () =>
      buildRosterPlan(
        {
          ...report,
          league: { ...report.league, stale: stale || report.league.stale },
        },
        now,
        analysis,
      ),
    [report, stale, now, analysis],
  );
  const { league } = report;
  const rules = league.rosterRules;
  const byeGaps = plan.byes.filter((b) => b.missing.length > 0);
  const priority = plan.needs.find((n) => n.priority === 'immediate');
  const contingencies = plan.needs.filter((n) => n !== priority);
  const provider = league.platform === 'espn' ? 'ESPN' : 'Sleeper';
  const sourceLinks: Record<string, string> = {
    formats:
      'https://support.sleeper.com/en/articles/4172355-how-can-i-add-additional-roster-positions',
    bench: 'https://www.footballguys.com/article/2019-large-bench-leagues',
    waivers:
      'https://www.thefantasyfootballers.com/analysis/fantasy-football-101-faab-strategies/',
    dynasty:
      'https://www.footballguys.com/article/2022-dynasty-startups-win-now',
    keeper:
      'https://support.sleeper.com/en/articles/2219811-how-do-i-set-the-round-cost-for-keepers',
    premium:
      'https://www.fantasypros.com/2026/08/expert-fantasy-football-draft-strategy-tight-ends-2026/',
  };
  return (
    <section className="panel roster-plan" aria-labelledby="roster-title">
      <header className="roster-heading">
        <div>
          <div className="eyebrow">
            <Layers3 size={16} /> BUILD WITH A PURPOSE
          </div>
          <h2 id="roster-title">Roster construction</h2>
        </div>
        <span className="roster-format">
          {plan.format === 'unknown'
            ? 'Format not supplied'
            : plan.format === 'special'
              ? 'Special format'
              : plan.format[0].toUpperCase() + plan.format.slice(1)}
          {rules?.bestBall ? ' · Best ball' : ''}
        </span>
      </header>
      <div className="roster-inventory" aria-label="Roster inventory">
        <div>
          <span>Active roster</span>
          <strong>
            {plan.active}
            <small>{plan.capacity === null ? '' : ` / ${plan.capacity}`}</small>
          </strong>
        </div>
        <div>
          <span>On your bench</span>
          <strong>{plan.bench}</strong>
        </div>
        <div>
          <span>IR / Taxi</span>
          <strong>
            {plan.ir}
            <small> / </small>
            {plan.taxi}
          </strong>
        </div>
        <div>
          <span>Next 4 weeks</span>
          <strong>
            {byeGaps.length}
            <small> bye {byeGaps.length === 1 ? 'gap' : 'gaps'}</small>
          </strong>
        </div>
      </div>
      <p className="roster-space">
        {plan.free === null
          ? 'Active roster capacity was not supplied. Check roster limits before adding someone.'
          : plan.free > 0
            ? `${plan.free} open active roster ${plan.free === 1 ? 'place' : 'places'} by roster count. Check position limits and IR eligibility before adding.`
            : plan.free === 0
              ? 'Roster full: an addition needs an allowed drop or roster move.'
              : 'Your active roster exceeds its configured capacity. Review it in your league app before adding.'}
      </p>
      <div className="roster-decision">
        <span className="roster-label">THIS WEEK’S COVERAGE</span>
        <h3>
          {!plan.fresh
            ? 'Refresh to check your depth'
            : plan.limited
              ? 'Roster inventory and planning'
              : !plan.current
                ? 'Planning snapshot'
                : !plan.weekly
                  ? 'Some weekly player data is pending'
                  : (priority?.title ??
                    (plan.open === 0
                      ? 'Your starters are locked for this week'
                      : contingencies.length
                        ? 'Your lineup is covered. Keep a fallback plan.'
                        : 'Your remaining slots have legal backup cover'))}
        </h3>
        <p>
          {!plan.fresh
            ? 'Counts and byes reflect the saved roster. Current coverage and pickup suggestions return after a fresh sync.'
            : plan.limited
              ? 'This format includes best ball, special rules or positions outside the weekly coverage check. Review its lineup and acquisition rules in your league app.'
              : !plan.current
                ? 'Weekly backup checks apply to the current week of an active season. Counts describe the current roster.'
                : !plan.weekly
                  ? 'Confirmed scores, projections and locks are needed before identifying coverage gaps. Zero projections are included normally.'
                  : (priority?.detail ??
                    (plan.open === 0
                      ? 'Played players stay in their assigned slots. Use the bye outlook to plan your next moves.'
                      : contingencies.length
                        ? `${contingencies.length} remaining starters have no available bench fallback. Review the individual checks below and weigh the roster cost before adding cover. Healthy starters do not each need a permanent backup.`
                        : `Each remaining starter has an individual fallback. Backup points may be lower; these alternatives do not cover multiple absences at once.${plan.protected ? ` ${plan.protected} locked ${plan.protected === 1 ? 'slot stays' : 'slots stay'} fixed.` : ''}`))}
        </p>
        {plan.weekly && priority && (
          <div className="roster-options">
            {priority.options.length ? (
              <>
                <b>Compare for coverage</b>
                {priority.options.map((p) => (
                  <div key={p.id}>
                    <span>
                      {p.name}{' '}
                      <small>
                        {p.position} · {p.team}
                      </small>
                    </span>
                    <strong>
                      {p.projection!.toFixed(1)} <small>proj pts</small>
                    </strong>
                  </div>
                ))}
              </>
            ) : (
              <span>
                {plan.ownershipVerified
                  ? 'No qualifying option found in the checked waiver pool.'
                  : 'Waiver ownership has not been verified; no pickup is suggested.'}
              </span>
            )}
            <small>
              Each addition is an alternative before any required drop. Coverage
              does not guarantee a scoring upgrade; compare weekly gain below.
            </small>
          </div>
        )}
        <div className="roster-decision-links">
          <button className="text-link" onClick={onLineup}>
            Review lineup
          </button>
          <a className="text-link" href="#waiver-shortlist">
            Compare waiver gains <ArrowDown size={15} />
          </a>
        </div>
        {plan.weekly && contingencies.length > 0 && (
          <details className="roster-more">
            <summary>
              {contingencies.length} individual fallback{' '}
              {contingencies.length === 1 ? 'check' : 'checks'}
            </summary>
            <p>
              These are separate absence scenarios. Adding coverage still
              requires an allowed roster move, and does not guarantee a scoring
              upgrade.
            </p>
            {contingencies.map((n) => (
              <div key={n.title}>
                <h4>{n.title}</h4>
                <p>{n.detail}</p>
                <p>
                  {n.options.length
                    ? `Compare: ${n.options.map((p) => `${p.name} (${p.projection!.toFixed(1)} projected)`).join(' or ')}.`
                    : 'No qualifying addition found in the checked pool.'}
                </p>
              </div>
            ))}
          </details>
        )}
      </div>
      <details className="roster-detail">
        <summary>Position depth, bye outlook & league strategy</summary>
        <p className="roster-space">
          Starting slots: {league.slots.map((s) => s.label).join(' · ')}.<br />
          Bench limit: {rules?.benchSlots ?? 'unknown'} · IR limit:{' '}
          {rules?.irSlots ?? 'unknown'} · Taxi limit:{' '}
          {rules?.taxiSlots ?? 'unknown'}. Empty IR or taxi spaces are not
          automatic waiver openings.
        </p>
        <div className="roster-grid">
          <div className="roster-depth">
            <h3>Your depth by position</h3>
            <p>
              Open a position to see every player. Available bench counts apply
              to this week.
            </p>
            {plan.rows.map((row) => (
              <details className="roster-position" key={row.position}>
                <summary>
                  <strong>{row.position}</strong>
                  <span>
                    {row.starting.length} in lineup · {row.bench.length} bench
                    {row.reserve.length
                      ? ` · ${row.reserve.length} reserved`
                      : ''}
                  </span>
                  <b>
                    {plan.weekly
                      ? `${row.ready.length} available`
                      : 'Inventory'}
                  </b>
                </summary>
                <ul>
                  {row.players.map((p) => {
                    const points = playerPoints(p, now);
                    return (
                      <li key={p.id}>
                        <div>
                          <strong>{p.name}</strong>
                          <span>
                            {p.team} ·{' '}
                            {p.reserve
                              ? 'IR'
                              : p.taxi
                                ? 'Taxi'
                                : p.slot
                                  ? 'In lineup'
                                  : 'Bench'}
                            {p.bye
                              ? ' · Bye'
                              : p.injury !== 'ACTIVE'
                                ? ` · ${p.injury.replaceAll('_', ' ')}`
                                : ''}
                          </span>
                        </div>
                        <div>
                          <strong>
                            {points.value === null
                              ? '—'
                              : points.value.toFixed(1)}
                          </strong>
                          <span>{points.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
            <small>
              Counts use each player’s primary position. FLEX eligibility is
              shared. Played bench players, reserves, unavailable players and
              uncertain locks do not count as available cover. A projected 0
              still counts as a legal option with 0 expected points.
            </small>
          </div>
          <div className="roster-byes">
            <h3>
              <CalendarDays size={18} /> Bye outlook
            </h3>
            <p>Next four weeks · current roster and confirmed byes</p>
            {plan.byes.length ? (
              plan.byes.map((b) => (
                <article
                  key={b.week}
                  className={b.missing.length ? 'roster-bye-gap' : ''}
                >
                  <div>
                    <strong>Week {b.week}</strong>
                    <span>
                      {b.missing.length
                        ? `${b.missing.length} ${b.missing.length === 1 ? 'slot lacks' : 'slots lack'} cover`
                        : b.uncertain
                          ? 'Coverage uncertain'
                          : 'Eligible cover on roster'}
                    </span>
                  </div>
                  <p>
                    {b.absent
                      .map((p) => `${p.name} (${p.position})`)
                      .join(', ')}
                  </p>
                  {b.missing.length > 0 && (
                    <small>
                      Review {b.missing.map((s) => s.label).join(', ')} coverage
                      before this week.
                    </small>
                  )}
                </article>
              ))
            ) : (
              <p className="roster-bye-empty">
                No confirmed roster byes in the next four weeks.
              </p>
            )}
            <small>
              {plan.byeUnknown > 0 &&
                `${plan.byeUnknown} ${plan.byeUnknown === 1 ? 'player has' : 'players have'} an unknown bye week. `}
              {plan.limited &&
                'Only supported offensive and K/D/ST slots are checked. '}
              This checks position coverage, not future production. It assumes
              active players are healthy and ignores this week’s locks and
              projections. IR and taxi players are excluded.
            </small>
          </div>
        </div>
        <div className="roster-principles">
          {plan.tips.map((t) => (
            <article key={t.title}>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
              <a href={sourceLinks[t.source]} target="_blank" rel="noreferrer">
                Strategy background ↗
              </a>
            </article>
          ))}
        </div>
      </details>
      <details className="roster-research">
        <summary>
          <BookOpen size={18} /> Roster strategy guide{' '}
          <span>Evidence, examples & sources</span>
        </summary>
        <RosterStrategyGuide />
      </details>
      <p className="roster-footnote">
        Uses league-scored {provider} projections and actuals. Strategy does not
        change player scores.
      </p>
    </section>
  );
}
