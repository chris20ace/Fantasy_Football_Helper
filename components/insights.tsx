'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
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
import type { InsightReport, ProjectedPlayer } from '@/lib/fantasy/projections';
import type { League } from '@/lib/fantasy/types';
const pts = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1));
const state = (p: ProjectedPlayer) =>
  p.bye
    ? 'Bye'
    : p.reserve
      ? 'IR'
      : p.taxi
        ? 'Taxi'
        : p.injury && p.injury !== 'ACTIVE'
          ? p.injury.replaceAll('_', ' ')
          : '';

export default function Insights({
  leagues,
  selected,
  onSelect,
  week,
  now,
  blocked,
  refreshKey,
}: {
  leagues: League[];
  selected: string;
  onSelect: (id: string) => void;
  week: number;
  now: number;
  blocked: boolean;
  refreshKey: string;
}) {
  const active = leagues.find((l) => l.id === selected) ?? leagues[0];
  const id = active?.id ?? '';
  const [report, setReport] = useState<InsightReport | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState(''),
    [position, setPosition] = useState('ALL');
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(
          `/api/insights?league=${encodeURIComponent(id)}&week=${week}${attempt ? '&refresh=1' : ''}`,
          { signal: controller.signal },
        );
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        const data = (await response.json()) as InsightReport & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? 'Insights are unavailable.');
        if (!controller.signal.aborted) setReport(data);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Insights are unavailable.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setReport(null);
      setError('');
      setLoading(true);
      void load();
    });
    return () => controller.abort();
  }, [id, week, attempt, refreshKey]);
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
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setAttempt((a) => a + 1)}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          Refresh insights
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
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </Button>
        </div>
      )}
      {valid && analysis && (
        <>
          {stale && (
            <div className="alert" aria-live="polite">
              Refresh insights before acting. These figures are a previous
              snapshot.
            </div>
          )}
          <div className="insight-scoreboard">
            <section className="insight-model-card">
              <div className="eyebrow">SUNDAY DESK MODEL · WEEK {week}</div>
              <h2>Your scoring changes the picture.</h2>
              <p>
                Up to eight actual games, rescored for this league. Recent
                appearances carry more weight.
              </p>
              <span>
                <Sparkles size={15} />
                {
                  valid.league.players.filter((p) => p.forecast.points !== null)
                    .length
                }{' '}
                / {valid.league.players.length} roster forecasts ready
              </span>
            </section>
            <section className="panel insight-metric">
              <Target size={22} />
              <span>Optimized model total</span>
              <b>
                {pts(analysis.recommendedTotal)}
                <small> pts</small>
              </b>
              <p>
                {analysis.enabled
                  ? `${analysis.changes.length} starter changes suggested`
                  : 'Research view · advice paused'}
              </p>
            </section>
            <section className="panel insight-metric">
              <ChartNoAxesCombined size={22} />
              <span>Potential waiver upside</span>
              <b>
                {waivers[0]?.gain != null ? `+${pts(waivers[0].gain)}` : '—'}
                <small> pts</small>
              </b>
              <p>Before any required roster move</p>
            </section>
          </div>
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
            <p className="insight-caution">
              Potential gain compares an add with your already-optimized roster.
              It assumes a roster spot can be made without losing those
              starters. Check required drops, roster limits, waiver timing and
              budget in your league; no claims are submitted here. We compare up
              to 24 eligible candidates, four per eligibility group. Gain
              calculations are available for leagues with up to 10 starter
              slots.
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
                      {pick.player.opponent || 'Schedule unconfirmed'}{' '}
                      {state(pick.player) && <b>{state(pick.player)}</b>}
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
                    <small>
                      {pick.player.forecast.games} games · observed range{' '}
                      {pts(pick.player.forecast.low)}–
                      {pts(pick.player.forecast.high)} pts
                    </small>
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
          </section>
          <section className="panel insight-section">
            <div className="insight-section-head">
              <div>
                <div className="eyebrow">INDEPENDENT FORECASTS</div>
                <h2>Your players, under your rules.</h2>
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
            <Table className="insight-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Player / game history</TableHead>
                  <TableHead>Sunday Desk</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Difference</TableHead>
                  <TableHead>Observed range</TableHead>
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
                      <TableCell>
                        <details className="player-history">
                          <summary>
                            <strong>{p.name}</strong>
                            <span>
                              {p.position} · {p.team}
                              {state(p) ? ` · ${state(p)}` : ''}
                            </span>
                          </summary>
                          <p>{p.forecast.note}</p>
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
                      <TableCell>
                        <strong>{pts(p.projection)}</strong>
                        {unavailable(p) && (
                          <small className="insight-unavailable">
                            Unavailable
                          </small>
                        )}
                      </TableCell>
                      <TableCell>{pts(p.providerProjection)}</TableCell>
                      <TableCell>
                        {diff == null
                          ? '—'
                          : `${diff > 0 ? '+' : ''}${pts(diff)}`}
                      </TableCell>
                      <TableCell>
                        {p.forecast.low == null
                          ? '—'
                          : `${pts(p.forecast.low)}–${pts(p.forecast.high)}`}
                      </TableCell>
                      <TableCell>{p.forecast.games}/8</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!rows.length && (
              <p className="insight-empty">No players match these filters.</p>
            )}
          </section>
          <section className="panel insight-section">
            <div className="eyebrow">MODEL LINEUP</div>
            <h2>Put those estimates to work.</h2>
            <p>
              Uses only players already on your roster. Locked starters stay in
              place. The Lineup lab continues to use provider projections.
            </p>
            <div className="model-lineup-grid">
              {analysis.assignments.map((a) => (
                <div key={a.slot.id}>
                  <span>{a.slot.label}</span>
                  <strong>{a.recommended?.name ?? 'Empty slot'}</strong>
                  <b>{pts(a.recommended?.projection)}</b>
                  <small>
                    {a.locked
                      ? 'Locked'
                      : a.current?.id !== a.recommended?.id
                        ? `For ${a.current?.name ?? 'empty slot'}`
                        : 'Keep'}
                  </small>
                </div>
              ))}
            </div>
            {analysis.reasons.map((reason) => (
              <p className="insight-caution" key={reason}>
                {reason}
              </p>
            ))}
          </section>
          <details className="panel insight-method">
            <summary>How these projections work</summary>
            <p>
              {valid.model}. Uses up to eight played games within the previous
              12 regular-season weeks, stopping before both the selected and
              current week. Each earlier appearance gets 85% of the weight of
              the next more recent one. At least three scored games are
              required.
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
