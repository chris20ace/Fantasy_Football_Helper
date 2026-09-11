'use client';
import { useMemo, useState } from 'react';
import { ArrowUpRight, ChartNoAxesCombined, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { analyze, unavailable } from '@/lib/fantasy/analysis';
import { rankWaivers } from '@/lib/fantasy/projections';
import type { ProjectedPlayer } from '@/lib/fantasy/projections';
import type { LeagueInsightsState } from './use-league-insights';
import type { League } from '@/lib/fantasy/types';
const pts = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1));
const playerStatus = (p: ProjectedPlayer) =>
  p.bye
    ? 'Bye'
    : p.reserve
      ? 'IR'
      : p.taxi
        ? 'Taxi'
        : p.injury && p.injury !== 'ACTIVE'
          ? p.injury.replaceAll('_', ' ')
          : '';

function RoleDetails({ player }: { player: ProjectedPlayer }) {
  const role = player.role;
  if (!role) return <p>Current NFL role has not been verified.</p>;
  const usage = role.usage;
  return (
    <div className="role-details">
      <p>{role.detail}</p>
      {role.ahead.length > 0 && (
        <p>
          <strong>Ahead on the chart:</strong> {role.ahead.join(' · ')}
        </p>
      )}
      {['QB', 'RB', 'WR', 'TE'].includes(player.position) && (
        <>
          <div className="role-usage">
            <span>
              <b>
                {usage.snaps === null
                  ? '—'
                  : `${Math.round(usage.snaps * 100)}%`}
              </b>
              Offensive snaps
            </span>
            {player.position === 'QB' ? (
              <span>
                <b>{pts(usage.passAttempts)}</b>Pass attempts / game
              </span>
            ) : (
              <span>
                <b>{pts(usage.targets)}</b>Targets / game
              </span>
            )}
            {player.position === 'RB' && (
              <span>
                <b>{pts(usage.carries)}</b>Carries / game
              </span>
            )}
          </div>
          <small>
            {usage.games} most recent observed weeks on this NFL team
            {usage.through ? ` · through ${usage.through}` : ''}. Missing
            metrics stay unknown.
          </small>
          {!!usage.noAppearance && (
            <small>
              {usage.noAppearance} active games without a recorded appearance in
              this usage window. The scoring estimate uses played appearances,
              shown separately in game history.
            </small>
          )}
        </>
      )}
      {role.sourceUrl && (
        <a
          className="text-link"
          href={role.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Check NFL depth chart <ArrowUpRight size={13} />
        </a>
      )}
      {role.checkedAt && (
        <small>
          Roster and chart checked {new Date(role.checkedAt).toLocaleString()}.
          Chart publication time is not supplied.
        </small>
      )}
    </div>
  );
}

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
  const id = active?.id ?? '';
  const { report, error, loading } = state;
  const refresh =
    blocked || active?.stale || active?.error ? onRefresh : state.refresh;
  const [search, setSearch] = useState(''),
    [position, setPosition] = useState('ALL');
  const valid =
    report?.league.id === id && report.league.week === week ? report : null;
  const stale =
    blocked ||
    !!active?.stale ||
    !!active?.error ||
    (!!valid && now - Date.parse(valid.fetchedAt) > 300000);
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
  const rows = useMemo(
    () =>
      valid?.league.players
        .filter(
          (p) =>
            (position === 'ALL' || p.position === position) &&
            `${p.name} ${p.team}`.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => (b.projection ?? -999) - (a.projection ?? -999)) ?? [],
    [valid, position, search],
  );
  const exclusions =
    valid?.candidates
      .filter((p) => p.modelExcluded)
      .sort(
        (a, b) =>
          (b.forecast.baselinePoints ?? -999) -
          (a.forecast.baselinePoints ?? -999),
      )
      .slice(0, 8) ?? [];
  if (!active)
    return (
      <div className="panel insight-empty">
        Connect a league to create your projections.
      </div>
    );
  return (
    <div className="insights-workspace">
      <div className="insight-toolbar">
        <Select value={id} onValueChange={(v) => v && onSelect(v)}>
          <SelectTrigger aria-label="League for insights">
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
          <ChartNoAxesCombined size={30} />
          <h2>Building your league’s forecasts.</h2>
          <p>
            Scoring past games, checking every roster, and finding potential
            upgrades. The first scan can take a little longer.
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
          <section className="panel insight-section">
            <div className="insight-section-head">
              <div>
                <div className="eyebrow">THE PICKUP SHORTLIST</div>
                <h2>Who could help this week?</h2>
                <p>
                  {valid.evaluated} unrostered candidates evaluated for{' '}
                  {active.name}.
                </p>
              </div>
              <a
                className="text-link"
                href={active.url}
                target="_blank"
                rel="noreferrer"
              >
                Open league <ArrowUpRight size={16} />
              </a>
            </div>
            <details className="insight-caution">
              <summary>How to use waiver suggestions</summary>
              <p>
                Potential gain compares an add with your already-optimized
                roster. It assumes a roster spot can be made without losing
                those starters. Check required drops, roster limits, waiver
                timing and budget in your league; no claims are submitted here.
                We compare up to 24 eligible candidates, four per eligibility
                group. Gain calculations are available for leagues with up to 10
                starter slots.
              </p>
            </details>
            {waivers.length ? (
              <div className="waiver-grid">
                {waivers.slice(0, 6).map((pick, i) => (
                  <article className="waiver-card" key={pick.player.id}>
                    <div className="waiver-rank">
                      <span>#{String(i + 1).padStart(2, '0')}</span>
                      <span>{pick.player.availability}</span>
                    </div>
                    <h3>{pick.player.name}</h3>
                    <span
                      className={`role-badge ${pick.player.role?.status ?? 'unknown'}`}
                    >
                      {pick.player.role?.label ?? 'Role unverified'}
                    </span>
                    <div className="insight-player-meta">
                      {pick.player.position} · {pick.player.team} ·{' '}
                      {pick.player.opponent || 'Schedule unconfirmed'}{' '}
                      {playerStatus(pick.player) && (
                        <b>{playerStatus(pick.player)}</b>
                      )}
                    </div>
                    <div className="waiver-values">
                      <div>
                        <b>{pts(pick.player.projection)}</b>
                        <span>Model points</span>
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
                    <details className="waiver-evidence">
                      <summary>Why this pick?</summary>
                      <RoleDetails player={pick.player} />
                      <small>
                        {pick.player.forecast.games} games · observed range{' '}
                        {pts(pick.player.forecast.low)}–
                        {pts(pick.player.forecast.high)} pts
                      </small>
                    </details>
                    {pick.player.waiverDate && (
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
                <h3>No actionable shortlist right now.</h3>
                <p>
                  {!valid.ownershipVerified
                    ? 'League ownership could not be fully verified.'
                    : valid.league.week !== valid.league.currentWeek
                      ? 'Choose the current NFL week for waiver suggestions.'
                      : 'No evaluated candidate meets the history, scoring, availability and game-lock checks. Refresh after checking your league.'}
                </p>
              </div>
            )}
            {!!exclusions.length && (
              <details className="role-exclusions">
                <summary>Why these players were left off the shortlist</summary>
                {exclusions.map((p) => (
                  <article key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <span
                        className={`role-badge ${p.role?.status ?? 'unknown'}`}
                      >
                        {p.role?.label}
                      </span>
                      <small>
                        Historical baseline: {pts(p.forecast.baselinePoints)}{' '}
                        pts
                      </small>
                    </div>
                    <p>{p.role?.detail}</p>
                  </article>
                ))}
              </details>
            )}
          </section>
          <details className="panel insight-section player-research">
            <summary>Player projections & supporting research</summary>
            <div className="insight-section-head">
              <div>
                <div className="eyebrow">INDEPENDENT FORECASTS</div>
                <h2>Your player projections</h2>
                <p>
                  Compare with the provider estimate. Open a player’s history to
                  see what drives the model.
                </p>
              </div>
            </div>
            <div className="insight-filters">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your players…"
                aria-label="Search projected players"
              />
              <Select
                value={position}
                onValueChange={(v) => v && setPosition(v)}
              >
                <SelectTrigger aria-label="Projection position">
                  <SelectValue>
                    {position === 'ALL' ? 'All positions' : position}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[
                    'ALL',
                    ...new Set(valid.league.players.map((p) => p.position)),
                  ].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p === 'ALL' ? 'All positions' : p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Table
              className="responsive-table insight-table"
              aria-label="Player estimates and past performance"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Player / game history</TableHead>
                  <TableHead>Model estimate</TableHead>
                  <TableHead>Past baseline</TableHead>
                  <TableHead>Provider estimate</TableHead>
                  <TableHead>Difference</TableHead>
                  <TableHead>Past range</TableHead>
                  <TableHead>Games</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const diff =
                    p.projection !== null && p.providerProjection !== null
                      ? p.projection - p.providerProjection
                      : null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell data-label="Player & history">
                        <details className="player-history">
                          <summary>
                            <strong>{p.name}</strong>
                            <span>
                              {p.position} · {p.team}
                              {playerStatus(p) ? ` · ${playerStatus(p)}` : ''}
                            </span>
                          </summary>
                          <RoleDetails player={p} />
                          <p>{p.forecast.note}</p>
                          {p.forecast.baselineHistory?.length ? (
                            <p>
                              Historical baseline:{' '}
                              {pts(p.forecast.baselinePoints)} points across{' '}
                              {p.forecast.baselineHistory.length} games, before
                              the current-role screen. {p.forecast.games} games
                              fit the current role.
                            </p>
                          ) : null}
                          {p.forecast.history.length > 0 && (
                            <div
                              className="game-history-bars"
                              aria-label="Past game scores"
                            >
                              {[...p.forecast.history].reverse().map((g) => (
                                <div key={`${g.season}:${g.week}`}>
                                  <span>
                                    {g.season} W{g.week}
                                  </span>
                                  <meter
                                    aria-label={`${p.name}, ${g.season} week ${g.week} fantasy points`}
                                    min={Math.min(
                                      0,
                                      ...p.forecast.history.map(
                                        (x) => x.points,
                                      ),
                                    )}
                                    max={Math.max(
                                      1,
                                      ...p.forecast.history.map(
                                        (x) => x.points,
                                      ),
                                    )}
                                    value={g.points}
                                  />
                                  <b>{pts(g.points)}</b>
                                </div>
                              ))}
                            </div>
                          )}
                          <p>
                            Recent 3: {pts(p.forecast.recent)} · Earlier games:{' '}
                            {pts(p.forecast.earlier)} pts per game
                            <br />
                            Receptions contribute{' '}
                            {pts(p.forecast.receptionPoints)} model points under
                            your rules.
                          </p>
                        </details>
                      </TableCell>
                      <TableCell data-label="Model estimate">
                        <strong>{pts(p.projection)}</strong>
                        <span
                          className={`role-badge ${p.role?.status ?? 'unknown'}`}
                        >
                          {p.role?.label ?? 'Role unverified'}
                        </span>
                        {p.projection === null && (
                          <small className="role-withheld">
                            {p.modelExcluded
                              ? 'Excluded from recommendations'
                              : 'Withheld · insufficient role or workload evidence'}
                          </small>
                        )}
                        {unavailable(p) && (
                          <small className="insight-unavailable">
                            Unavailable
                          </small>
                        )}
                      </TableCell>
                      <TableCell data-label="Past baseline">
                        {pts(p.forecast.baselinePoints)}
                        <small className="role-withheld">
                          Past production only
                        </small>
                      </TableCell>
                      <TableCell data-label="Provider estimate">
                        {pts(p.providerProjection)}
                      </TableCell>
                      <TableCell data-label="Model vs. provider">
                        {diff == null
                          ? '—'
                          : `${diff > 0 ? '+' : ''}${pts(diff)}`}
                      </TableCell>
                      <TableCell data-label="Past range">
                        {p.forecast.low == null
                          ? '—'
                          : `${pts(p.forecast.low)}–${pts(p.forecast.high)}`}
                      </TableCell>
                      <TableCell data-label="Games in model">
                        {p.forecast.games}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!rows.length && (
              <p className="insight-empty">No players match these filters.</p>
            )}
          </details>
          <Button className="plan-main-button" onClick={onLineup}>
            Review your recommended lineup
          </Button>
          <details className="panel insight-method">
            <summary>How these projections work</summary>
            <p>
              {valid.model}. The historical baseline uses up to eight played
              games within the previous 12 regular-season weeks. The
              current-role estimate assesses the latest three same-team
              appearances together; kickers and team defenses use up to eight.
              Each earlier appearance gets 85% of the weight of the next more
              recent one. At least three scored games are required. History
              stops before the current week, and current roles are only used for
              this week’s recommendations.
            </p>
            <p>
              Reserve quarterbacks/kickers, players without an NFL team,
              practice-squad players and unavailable roster statuses do not
              receive a starting projection. Receivers in separate first-unit
              depth-chart rows remain starters. Backups are never automatically
              promoted when someone ahead is injured.
            </p>
            <p>
              Workload checks use the whole three-game window, keeping zero and
              low-scoring appearances. These are conservative heuristics, not
              trained playing-time predictions. First-unit averages need 40%
              offensive snaps, or (when snaps are unavailable) six carries plus
              targets for RBs, three targets for WRs, or two for TEs. Rotational
              averages use 15–70% snaps, or 3–16 carries plus targets for RBs
              and 2–6 targets for receivers. Deep reserves need recorded snap
              shares above zero and at most 30%. Starting QBs need 15 attempts
              or 50% snaps. Two recent active games without a recorded
              appearance pause the estimate. Missing usage stays unknown; no
              depth multiplier is applied to points.
            </p>
            <p>
              We apply this league’s scoring to each game before averaging,
              preserving the frequency of yardage bonuses and defensive scoring
              bands. The observed range is the 20th–80th percentile of those
              past scores, not a probability interval or a floor/ceiling
              guarantee. Bye weeks are set to zero.
            </p>
            {valid.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            {valid.database?.map((source) => (
              <p key={source.provider}>
                {source.provider === 'espn' ? 'ESPN' : 'Sleeper'} stats
                database: {source.rows.toLocaleString()} weekly records across{' '}
                {source.players.toLocaleString()} player/team identities. Latest
                import {new Date(source.updatedAt).toLocaleString()}. Database
                records are checked against completed regular-season games;
                Sleeper supplies additional workload statistics where available.
              </p>
            ))}
            <p>
              History through {valid.historyThrough} · Ownership checked{' '}
              {new Date(valid.fetchedAt).toLocaleString()}.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
