'use client';
import SetupLink from './setup-link';
import SignOut from './sign-out';
import Insights from './insights';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  Info,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Trophy,
  Unplug,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { Analysis, Dashboard, League, Player } from '@/lib/fantasy/types';
import {
  analyze,
  exposure,
  isLocked,
  unavailable,
} from '@/lib/fantasy/analysis';

type View = 'overview' | 'lab' | 'insights' | 'portfolio' | 'sources';
type Preferences = {
  revision: number;
  notes: Record<string, string>;
  reviewed: Record<string, boolean>;
};
const menu = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'lab', label: 'Lineup', icon: Target },
  { id: 'insights', label: 'Insights', icon: Zap },
  { id: 'portfolio', label: 'Players', icon: Layers3 },
  { id: 'sources', label: 'Accounts', icon: Radio },
] as const;
const number = (n: number | null | undefined) =>
  n == null ? '—' : n.toFixed(1);
const time = (value: string | number) =>
  new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
const status = (p: Player) =>
  p.taxi
    ? 'TAXI'
    : p.reserve
      ? 'IR'
      : p.bye
        ? 'BYE'
        : p.injury === 'ACTIVE' || !p.injury
          ? ''
          : p.injury.replaceAll('_', ' ');
function PlatformTag({ value }: { value: string }) {
  return <span className={`platform ${value}`}>{value.toUpperCase()}</span>;
}
function Rail({
  view,
  onView,
  leagues,
  onLeague,
}: {
  view: View;
  onView: (v: View) => void;
  leagues: League[];
  onLeague: (id: string) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar className="app-sidebar">
      <div className="rail-interior">
        <button
          className="drawer-close"
          aria-label="Close navigation"
          onClick={() => setOpenMobile(false)}
        >
          <X size={20} />
        </button>
        <div className="brand">
          <span className="brand-icon">
            <Zap size={23} />
          </span>
          Sunday<span>Desk</span>
          <small>FANTASY FOOTBALL WORKSPACE</small>
        </div>
        <div className="rail-label">YOUR ADVANTAGE, EVERY WEEK</div>
        <nav aria-label="Main navigation">
          {menu.map((m) => (
            <button
              key={m.id}
              className={view === m.id ? 'rail-current' : 'rail-item'}
              onClick={() => {
                onView(m.id);
                setOpenMobile(false);
              }}
              aria-current={view === m.id ? 'page' : undefined}
            >
              <m.icon size={18} />
              {m.label}
            </button>
          ))}
        </nav>
        <div className="rail-leagues">
          <div className="rail-label">
            YOUR LEAGUES <span>{leagues.length}</span>
          </div>
          {leagues.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                onLeague(l.id);
                setOpenMobile(false);
              }}
            >
              <span className={`source-dot ${l.platform}`} />
              <span>{l.name}</span>
              {l.error ? <CircleAlert size={12} /> : <ChevronRight size={12} />}
            </button>
          ))}
        </div>
        <div className="rail-account-actions">
          <SetupLink className="account-link">Manage leagues</SetupLink>
          <SignOut />
        </div>
        <div className="rail-bottom">
          <ShieldCheck size={19} />
          <p>
            Just your leagues. Just you.<small>Private workspace · 2026</small>
          </p>
        </div>
      </div>
    </Sidebar>
  );
}
function PlayerName({
  player,
  sub = true,
}: {
  player: Player | null;
  sub?: boolean;
}) {
  if (!player) return <span className="empty-player">Empty slot</span>;
  return (
    <div className="player-name">
      <span className={`position ${player.position.toLowerCase()}`}>
        {player.position === 'DEF' ? 'DST' : player.position}
      </span>
      <div>
        <strong>{player.name}</strong>
        {sub && (
          <small>
            {player.team}{' '}
            {player.opponent && (
              <>
                <span>·</span>
                {player.opponent}
              </>
            )}
            {status(player) && (
              <em className={unavailable(player) ? 'injury bad' : 'injury'}>
                {status(player)}
              </em>
            )}
          </small>
        )}
      </div>
    </div>
  );
}
function Kickoff({ player, now }: { player: Player; now: number }) {
  return isLocked(player, now) ? (
    <span className="lock-label">
      <LockKeyhole size={11} />
      Locked
    </span>
  ) : player.bye ? (
    <span className="muted">Bye week</span>
  ) : player.kickoff ? (
    <span className="kickoff">
      {new Date(player.kickoff).toLocaleDateString([], { weekday: 'short' })}{' '}
      {time(player.kickoff)}
    </span>
  ) : (
    <span className="muted">Time unconfirmed</span>
  );
}

export default function FantasyDashboard({
  displayName,
}: {
  displayName: string;
}) {
  const [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [week, setWeek] = useState<number | undefined>(),
    [view, setView] = useState<View>('overview'),
    [selected, setSelected] = useState(''),
    [now, setNow] = useState(() => Date.now());
  const [preferences, setPreferences] = useState<Preferences>({
      notes: {},
      reviewed: {},
      revision: 0,
    }),
    [prefReady, setPrefReady] = useState(false),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [position, setPosition] = useState('ALL'),
    [platform, setPlatform] = useState('all');
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(
    async (refresh = false) => {
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (week) params.set('week', String(week));
        if (refresh) params.set('refresh', '1');
        const response = await fetch(`/api/dashboard?${params}`, {
          signal: request.signal,
        });
        if (response.status === 401) {
          setData(null);
          window.location.replace('/login');
          return;
        }
        const value = (await response.json()) as Dashboard & { error?: string };
        if (!response.ok)
          throw new Error(value.error ?? 'Unable to sync your leagues.');
        if (!value.leagues.length) {
          setData(null);
          window.location.replace('/setup');
          return;
        }
        setData(value);
        setError('');
        setNow(Date.now());
      } catch (e) {
        if (!request.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : 'Connection interrupted. Try again.',
          );
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    },
    [week],
  );
  useEffect(() => {
    const start = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(start);
      controller.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === 'visible') void load();
    }, 180000);
    return () => clearInterval(interval);
  }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    fetch('/api/preferences')
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Preferences>;
      })
      .then((v) => {
        setPreferences(v);
        setPrefReady(true);
      })
      .catch(() =>
        setNotice(
          'Notes could not load. Refresh the page before saving changes.',
        ),
      );
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view, selected]);
  const save = async (value: Preferences) => {
    if (!prefReady) return;
    setSaving(true);
    try {
      const r = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      const result = (await r.json()) as { error?: string; revision: number };
      if (!r.ok)
        throw new Error(result.error ?? 'Could not save. Please try again.');
      setPreferences({ ...value, revision: result.revision });
      setNotice('Saved to your private workspace.');
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : 'Could not save. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };
  const leagues = useMemo(() => data?.leagues ?? [], [data]);
  const analyses = useMemo(
    () =>
      new Map(
        leagues.map((l) => [
          l.id,
          analyze(error ? { ...l, stale: true } : l, now),
        ]),
      ),
    [leagues, now, error],
  );
  const active = leagues.find((l) => l.id === selected) ?? leagues[0];
  const selectLeague = (id: string) => {
    setSelected(id);
    setView('lab');
  };
  const synced = leagues.filter((l) => !l.error && l.players.length),
    issues = leagues
      .flatMap((l) => {
        const a = analyses.get(l.id)!;
        return a.enabled
          ? a.issues.map((issue) => ({
              league: l,
              ...issue,
              locked: issue.player ? isLocked(issue.player, now) : false,
            }))
          : [];
      })
      .sort(
        (a, b) =>
          Number(a.locked) - Number(b.locked) ||
          Number(a.reason.startsWith('Monitor')) -
            Number(b.reason.startsWith('Monitor')) ||
          (a.player?.kickoff ?? Infinity) - (b.player?.kickoff ?? Infinity),
      );
  const upgrades = leagues.filter((l) => {
    const a = analyses.get(l.id)!;
    return a.enabled && a.changes.length > 0;
  });
  const portfolio = useMemo(() => exposure(leagues), [leagues]);
  const selectedWeek = week ?? data?.week ?? 1,
    current = selectedWeek === data?.currentWeek;
  const filteredPortfolio = portfolio.filter(
    (p) =>
      (position === 'ALL' || p.position === position) &&
      `${p.name} ${p.team}`.toLowerCase().includes(search.toLowerCase()),
  );
  const reviewKey = (l: League) => `${data?.season}:${selectedWeek}:${l.id}`;
  const reviewed = leagues.filter(
    (l) => preferences.reviewed[reviewKey(l)],
  ).length;
  const deadline = leagues
    .flatMap((l) =>
      l.players
        .filter((p) => p.slot && p.kickoff && p.kickoff > now)
        .map((p) => p.kickoff!),
    )
    .sort((a, b) => a - b)[0];
  return (
    <SidebarProvider
      className="desk"
      style={
        {
          '--sidebar-width': 'var(--desk-sidebar-width, 238px)',
        } as React.CSSProperties
      }
    >
      <a className="skip-link" href="#main-content">
        Skip to dashboard
      </a>
      <Rail
        view={view}
        onView={setView}
        leagues={leagues}
        onLeague={selectLeague}
      />
      <main className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <SidebarTrigger className="mobile-trigger" />
            <span>
              Sunday Desk{' '}
              <span className="topbar-season">· {data?.season ?? 2026}</span>
            </span>
          </div>
          <div className="topbar-right">
            <span className="live-indicator">
              <i />
              {loading
                ? 'Syncing'
                : synced.length === leagues.length && leagues.length
                  ? 'Connected'
                  : 'Workspace'}
            </span>
            <SetupLink className="account-link">Manage leagues</SetupLink>
            <span className="avatar" title={displayName}>
              {displayName
                .split(/\s+/)
                .slice(0, 2)
                .map((n) => n[0])
                .join('')
                .toUpperCase()}
            </span>
            <SignOut />
          </div>
        </header>
        <div className="content" id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === 'overview'
                  ? 'MAKE EVERY ROSTER SPOT COUNT'
                  : view === 'lab'
                    ? 'YOUR ROSTER. YOUR RULES.'
                    : view === 'portfolio'
                      ? 'SEE THE BIGGER PICTURE'
                      : 'THE DETAILS BEHIND THE DECISIONS'}
              </div>
              <h1>
                {view === 'overview'
                  ? `Week ${selectedWeek} overview`
                  : view === 'lab'
                    ? 'Set your lineup'
                    : view === 'portfolio'
                      ? 'Players across leagues'
                      : view === 'insights'
                        ? 'Projections & waivers'
                        : 'Your connections'}
              </h1>
              <p>
                {view === 'overview'
                  ? `${leagues.length} leagues. One clear view of your week.`
                  : view === 'lab'
                    ? 'Compare starters using provider estimates, with game locks respected.'
                    : view === 'portfolio'
                      ? 'See which players you own and start in each league.'
                      : view === 'insights'
                        ? 'Independent projections and waiver ideas, tailored to each league.'
                        : 'Know where your data comes from and when to refresh it.'}
              </p>
            </div>
            <div className="heading-actions">
              <Select
                value={String(selectedWeek)}
                onValueChange={(v) => {
                  if (v) setWeek(Number(v));
                }}
              >
                <SelectTrigger
                  aria-label="Select NFL week"
                  className="week-select"
                >
                  <SelectValue>{`Week ${String(selectedWeek).padStart(2, '0')}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 18 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      Week {i + 1}
                      {i + 1 === data?.currentWeek ? ' · current' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="refresh-button"
                onClick={() => load(true)}
                disabled={loading}
                aria-label="Refresh all leagues"
              >
                <RefreshCw size={15} className={loading ? 'spin' : ''} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <CircleAlert size={18} />
              <div>
                <b>Refresh interrupted</b>
                <p>{error}</p>
                {data && (
                  <p>
                    Showing the last loaded view. Refresh successfully before
                    making changes.
                  </p>
                )}
              </div>
              <Button variant="outline" onClick={() => load(true)}>
                Try again
              </Button>
            </div>
          )}
          {data && !current && (
            <div className="alert">
              <Clock3 size={18} />
              <p>
                {selectedWeek < data.currentWeek
                  ? 'Past-week reference'
                  : 'Future-week planning'}{' '}
                · Lineup recommendations are available for the current week.
                Roster and injury information may reflect today.
              </p>
              <Button variant="ghost" onClick={() => setWeek(data.currentWeek)}>
                Current week
              </Button>
            </div>
          )}
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList
              variant="line"
              className="page-tabs"
              aria-label="Dashboard views"
            >
              {menu.map((m) => (
                <TabsTrigger key={m.id} value={m.id}>
                  <m.icon size={15} />
                  <span>{m.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {(!data || data.week !== selectedWeek) && loading ? (
              <div className="loading-board" aria-label="Loading your leagues">
                <div className="feature">
                  <div>
                    <div className="eyebrow">
                      BRINGING YOUR LEAGUES TOGETHER
                    </div>
                    <h2>Setting the table for your week.</h2>
                    <p>
                      Reading rosters, league scoring, projections, and game
                      locks.
                    </p>
                  </div>
                  <RefreshCw className="spin" size={36} />
                </div>
                <div className="league-grid">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div className="league-card" key={i}>
                      <Skeleton className="h-5 w-16 mb-6" />
                      <Skeleton className="h-6 w-3/4 mb-4" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {data && data.week === selectedWeek && (
              <>
                <TabsContent value="overview">
                  <div className="feature">
                    <div>
                      <div className="eyebrow">
                        THE WEEKLY EDGE{' '}
                        <span className="feature-week">
                          WK {String(selectedWeek).padStart(2, '0')}
                        </span>
                      </div>
                      <h2>
                        {issues.filter((i) => !i.locked).length
                          ? `${issues.filter((i) => !i.locked).length} starting spots deserve a closer look.`
                          : upgrades.length
                            ? `A stronger combination is on your bench.`
                            : current
                              ? 'Your week, all in one place.'
                              : 'Look ahead. Learn from the past.'}
                      </h2>
                      <p>
                        {issues.length
                          ? 'Work through the watchlist, compare your options, then set your lineup in the league app.'
                          : upgrades.length
                            ? 'Compare projected starters using your league’s scoring rules.'
                            : 'Review your lineup, track your matchups, and see where your fantasy teams overlap.'}
                      </p>
                      <Button
                        className="feature-action"
                        onClick={() =>
                          selectLeague(
                            (
                              issues.find((i) => !i.locked)?.league ??
                              upgrades[0] ??
                              leagues[0]
                            ).id,
                          )
                        }
                      >
                        Review lineup <ArrowRight size={15} />
                      </Button>
                    </div>
                    <div className="feature-score">
                      <Target size={26} />
                      <b>
                        {reviewed}
                        <span>/{leagues.length}</span>
                      </b>
                      <small>LEAGUES REVIEWED</small>
                      <Progress
                        aria-label="Leagues reviewed"
                        aria-valuetext={`${reviewed} of ${leagues.length} leagues reviewed`}
                        value={
                          leagues.length ? (reviewed / leagues.length) * 100 : 0
                        }
                      />
                    </div>
                  </div>
                  <div className="stat-grid">
                    <Stat
                      label="Leagues in sync"
                      value={`${synced.length} / ${leagues.length}`}
                      detail={
                        synced.length === leagues.length
                          ? 'All roster connections responding'
                          : 'Some connections need attention'
                      }
                      icon={<Radio />}
                    />
                    <Stat
                      label="Starting spots to watch"
                      value={String(issues.length)}
                      detail={`${issues.filter((i) => i.locked).length} already locked · ${issues.filter((i) => !i.locked).length} to review`}
                      icon={<CircleAlert />}
                    />
                    <Stat
                      label="Lineups with alternatives"
                      value={String(upgrades.length)}
                      detail="Eligible bench combinations to compare"
                      icon={<Zap />}
                    />
                    <Stat
                      label="Next starter kickoff"
                      value={deadline ? time(deadline) : '—'}
                      detail={
                        deadline
                          ? new Date(deadline).toLocaleDateString([], {
                              weekday: 'long',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'No upcoming kickoff confirmed'
                      }
                      icon={<Clock3 />}
                    />
                  </div>
                  <div className="overview-split">
                    <section className="panel watch-panel">
                      <div className="section-head">
                        <div>
                          <div className="eyebrow">FIRST THINGS FIRST</div>
                          <h2>Your watchlist</h2>
                        </div>
                        <span className="count-pill">{issues.length}</span>
                      </div>
                      {issues.length ? (
                        issues.slice(0, 5).map((issue, i) => (
                          <button
                            className="watch-row"
                            key={`${issue.league.id}:${issue.slot}:${i}`}
                            onClick={() => selectLeague(issue.league.id)}
                          >
                            <span
                              className={`watch-symbol ${issue.reason.startsWith('Monitor') ? 'amber' : 'red'}`}
                            >
                              {issue.locked ? (
                                <LockKeyhole size={17} />
                              ) : (
                                <CircleAlert size={18} />
                              )}
                            </span>
                            <div>
                              <strong>
                                {issue.player?.name ?? `Fill ${issue.slot}`}
                              </strong>
                              <p>
                                {issue.reason}
                                {issue.locked ? ' · Locked' : ''}
                              </p>
                              <small>
                                {issue.league.name} ·{' '}
                                {issue.league.platform.toUpperCase()}
                              </small>
                            </div>
                            <ChevronRight size={16} />
                          </button>
                        ))
                      ) : (
                        <div className="empty-state compact">
                          <CheckCheck size={32} />
                          <h3>
                            {current
                              ? 'No starter warnings found.'
                              : 'Reference week selected.'}
                          </h3>
                          <p>
                            {current
                              ? 'Keep an eye on late injury reports and refresh before kickoff.'
                              : 'Choose the current week for a live decision watchlist.'}
                          </p>
                        </div>
                      )}
                      {issues.length > 5 && (
                        <p className="muted">
                          +{issues.length - 5} more flagged spots in the lineup
                          lab.
                        </p>
                      )}
                    </section>
                    <section className="panel exposure-preview">
                      <div className="section-head">
                        <div>
                          <div className="eyebrow">SHARED STAKES</div>
                          <h2>Your biggest overlaps</h2>
                        </div>
                        <Layers3 size={21} />
                      </div>
                      {portfolio.slice(0, 4).map((p) => (
                        <div key={p.key} className="overlap-row">
                          <div>
                            <strong>{p.name}</strong>
                            <small>
                              {p.position} · {p.team}
                            </small>
                          </div>
                          <div className="overlap-value">
                            <b>
                              {p.leagues.length}
                              <small>
                                {' '}
                                /{' '}
                                {leagues.filter((l) => l.players.length).length}
                              </small>
                            </b>
                            <Progress
                              aria-label="League share"
                              value={
                                (p.leagues.length /
                                  Math.max(
                                    1,
                                    leagues.filter((l) => l.players.length)
                                      .length,
                                  )) *
                                100
                              }
                            />
                          </div>
                        </div>
                      ))}
                      <button
                        className="text-link"
                        onClick={() => setView('portfolio')}
                      >
                        See all your players <ArrowRight size={14} />
                      </button>
                    </section>
                  </div>
                  <div className="section-head leagues-heading">
                    <div>
                      <div className="eyebrow">THE WHOLE FIELD</div>
                      <h2>Your leagues</h2>
                    </div>
                    <div className="filter-buttons">
                      {['all', 'espn', 'sleeper'].map((p) => (
                        <Button
                          key={p}
                          size="sm"
                          variant={platform === p ? 'secondary' : 'ghost'}
                          aria-pressed={platform === p}
                          onClick={() => setPlatform(p)}
                        >
                          {p === 'all' ? 'All leagues' : p.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="league-grid">
                    {leagues
                      .filter(
                        (l) => platform === 'all' || l.platform === platform,
                      )
                      .map((l) => (
                        <LeagueCard
                          key={l.id}
                          league={l}
                          analysis={analyses.get(l.id)!}
                          reviewed={!!preferences.reviewed[reviewKey(l)]}
                          onOpen={() => selectLeague(l.id)}
                        />
                      ))}
                  </div>
                </TabsContent>
                <TabsContent value="lab">
                  {active && (
                    <LineupLab
                      league={active}
                      analysis={analyses.get(active.id)!}
                      leagues={leagues}
                      onSelect={setSelected}
                      now={now}
                      note={preferences.notes[active.id] ?? ''}
                      onNote={(text) =>
                        setPreferences((p) => ({
                          ...p,
                          notes: { ...p.notes, [active.id]: text },
                        }))
                      }
                      onSave={() => save(preferences)}
                      saving={saving}
                      prefReady={prefReady}
                      reviewed={!!preferences.reviewed[reviewKey(active)]}
                      onReviewed={(value) =>
                        save({
                          ...preferences,
                          reviewed: {
                            ...preferences.reviewed,
                            [reviewKey(active)]: value,
                          },
                        })
                      }
                      onNotice={setNotice}
                      blockAdvice={!!error}
                    />
                  )}
                </TabsContent>
                <TabsContent value="insights">
                  <Insights
                    leagues={leagues}
                    selected={selected}
                    onSelect={setSelected}
                    week={selectedWeek}
                    now={now}
                    blocked={!!error}
                    refreshKey={data?.fetchedAt ?? ''}
                  />
                </TabsContent>
                <TabsContent value="portfolio">
                  <div className="portfolio-intro">
                    <div className="panel portfolio-total">
                      <Layers3 size={24} />
                      <b>{portfolio.length}</b>
                      <p>
                        unique players across{' '}
                        {leagues.filter((l) => l.players.length).length} roster
                        snapshots
                      </p>
                    </div>
                    <div className="panel portfolio-total">
                      <Users size={24} />
                      <b>
                        {portfolio.filter((p) => p.leagues.length > 1).length}
                      </b>
                      <p>players you own in more than one league</p>
                    </div>
                    <div className="panel portfolio-total">
                      <CircleAlert size={24} />
                      <b>
                        {
                          portfolio.filter(
                            (p) =>
                              p.injury &&
                              !['ACTIVE', 'NORMAL'].includes(p.injury),
                          ).length
                        }
                      </b>
                      <p>players with a reported injury designation</p>
                    </div>
                  </div>
                  <section className="panel portfolio-panel">
                    <div className="section-head">
                      <div>
                        <div className="eyebrow">YOUR FANTASY PORTFOLIO</div>
                        <h2>Where you own each player</h2>
                        <p className="muted">
                          Counts show roster ownership, including bench, IR, and
                          taxi. Totals include loaded snapshots.
                        </p>
                      </div>
                    </div>
                    <div className="table-toolbar">
                      <div className="search-field">
                        <Search size={16} />
                        <Input
                          aria-label="Search players"
                          placeholder="Search player or NFL team…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                          <button
                            aria-label="Clear search"
                            onClick={() => setSearch('')}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <Select
                        value={position}
                        onValueChange={(v) => setPosition(v ?? 'ALL')}
                      >
                        <SelectTrigger aria-label="Filter by position">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(
                            (p) => (
                              <SelectItem key={p} value={p}>
                                {p === 'ALL'
                                  ? 'All positions'
                                  : p === 'DEF'
                                    ? 'D/ST'
                                    : p}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <Table
                      className="responsive-table portfolio-table"
                      aria-label="Players across your leagues"
                    >
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player</TableHead>
                          <TableHead>Owned in</TableHead>
                          <TableHead>Starting in</TableHead>
                          <TableHead>Your leagues</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPortfolio.map((p) => (
                          <TableRow key={p.key}>
                            <TableCell data-label="Player">
                              <div className="player-name">
                                <span
                                  className={`position ${p.position.toLowerCase()}`}
                                >
                                  {p.position === 'DEF' ? 'DST' : p.position}
                                </span>
                                <div>
                                  <strong>{p.name}</strong>
                                  <small>
                                    {p.team}
                                    {p.injury &&
                                      !['ACTIVE', 'NORMAL'].includes(
                                        p.injury,
                                      ) && (
                                        <em className="injury">
                                          {p.injury.replaceAll('_', ' ')}
                                        </em>
                                      )}
                                  </small>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell data-label="Owned in">
                              <div className="exposure-cell">
                                <b>
                                  {p.leagues.length}{' '}
                                  <span>
                                    /{' '}
                                    {
                                      leagues.filter((l) => l.players.length)
                                        .length
                                    }
                                  </span>
                                </b>
                                <Progress
                                  aria-label="League share"
                                  value={
                                    (p.leagues.length /
                                      Math.max(
                                        1,
                                        leagues.filter((l) => l.players.length)
                                          .length,
                                      )) *
                                    100
                                  }
                                />
                              </div>
                            </TableCell>
                            <TableCell data-label="Starting in">
                              {p.leagues.filter((l) => l.starter).length}{' '}
                              lineups
                            </TableCell>
                            <TableCell data-label="Your leagues">
                              <div className="league-chips">
                                {p.leagues.map((l) => (
                                  <button
                                    key={l.id}
                                    onClick={() => selectLeague(l.id)}
                                  >
                                    {l.name}
                                    <ArrowUpRight size={11} />
                                  </button>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!filteredPortfolio.length && (
                      <div className="empty-state">
                        <Search size={28} />
                        <h3>No players match this filter.</h3>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSearch('');
                            setPosition('ALL');
                          }}
                        >
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </section>
                  <p className="footer-note">
                    Players are matched by ESPN player ID across platforms;
                    defenses by NFL team. Unmatched players remain separate.
                    Injury labels use the newest loaded source, with stale
                    snapshots last.
                  </p>
                </TabsContent>
                <TabsContent value="sources">
                  <Connections
                    leagues={leagues}
                    warnings={data.warnings}
                    onRefresh={() => load(true)}
                    loading={loading}
                  />
                </TabsContent>
              </>
            )}
          </Tabs>
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={13} /> Private · read-only league access
            </span>
            <span>
              {data
                ? `Last refreshed ${time(data.fetchedAt)} · Times shown in your local timezone`
                : 'Connecting to your leagues…'}
            </span>
          </footer>
        </div>
      </main>
      {notice && (
        <output className="toast">
          <Info size={17} />
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </output>
      )}
    </SidebarProvider>
  );
}

function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <b>{value}</b>
      <small>{detail}</small>
    </div>
  );
}
function LeagueCard({
  league: l,
  analysis: a,
  reviewed,
  onOpen,
}: {
  league: League;
  analysis: Analysis;
  reviewed: boolean;
  onOpen: () => void;
}) {
  const count = a.enabled ? a.issues.length : 0;
  return (
    <article className={`league-card ${l.error ? 'league-error' : ''}`}>
      <div className="card-top">
        <PlatformTag value={l.platform} />
        <span
          className={`card-status ${l.error ? 'danger' : reviewed ? 'success' : ''}`}
        >
          {l.error ? (
            'Needs attention'
          ) : reviewed ? (
            <>
              <Check size={11} />
              Reviewed
            </>
          ) : l.status === 'pre_draft' ? (
            'Pre-draft'
          ) : (
            l.record
          )}
        </span>
      </div>
      <h3>{l.name}</h3>
      <p className="team-name">{l.teamName}</p>
      <div className="card-matchup">
        <div>
          <span>YOUR SCORE</span>
          <b>{number(l.actual)}</b>
        </div>
        <span className="versus">vs</span>
        <div>
          <span>OPPONENT</span>
          <b>{number(l.opponent?.actual)}</b>
        </div>
      </div>
      <p className="opponent-name">
        {l.opponent ? `vs ${l.opponent.name}` : 'Weekly matchup not available'}
      </p>
      {l.matchupProjection !== null &&
        l.opponent?.projection !== null &&
        l.opponent && (
          <p className="forecast">
            ESPN live forecast{' '}
            <b>
              {number(l.matchupProjection)} <span>–</span>{' '}
              {number(l.opponent.projection)}
            </b>
          </p>
        )}
      <div className="league-meta">
        <span>{l.scoring}</span>
        <span>{l.players.length} players</span>
      </div>
      {l.error ? (
        <p className="card-warning">{l.error}</p>
      ) : count ? (
        <div className="card-warning">
          <CircleAlert size={13} />
          {count} starting {count === 1 ? 'spot' : 'spots'} to watch
        </div>
      ) : a.enabled && a.changes.length ? (
        <div className="card-opportunity">
          <Zap size={13} />
          {a.gain !== null && a.gain > 0.05
            ? `+${number(a.gain)} projected points available`
            : 'A bench alternative is available'}
        </div>
      ) : (
        <div className="card-neutral">
          {l.status === 'pre_draft'
            ? 'Plan ahead for your draft'
            : a.enabled
              ? 'Review your lineup options'
              : 'Roster available for reference'}
        </div>
      )}
      <button className="card-bottom" onClick={onOpen}>
        <span>Review lineup</span>
        <ArrowUpRight size={17} />
      </button>
    </article>
  );
}

function LineupLab({
  league: l,
  analysis: a,
  leagues,
  onSelect,
  now,
  note,
  onNote,
  onSave,
  saving,
  prefReady,
  reviewed,
  onReviewed,
  onNotice,
  blockAdvice,
}: {
  league: League;
  analysis: Analysis;
  leagues: League[];
  onSelect: (id: string) => void;
  now: number;
  note: string;
  onNote: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  prefReady: boolean;
  reviewed: boolean;
  onReviewed: (v: boolean) => void;
  onNotice: (v: string) => void;
  blockAdvice: boolean;
}) {
  const [mode, setMode] = useState('lineup');
  const actionable = a.enabled && !blockAdvice;
  const copy = async () => {
    const text = [
      `${l.name} · Week ${l.week} · projected lineup`,
      ...a.assignments.map(
        (row) =>
          `${row.slot.label}: ${row.recommended?.name ?? 'Empty'}${row.locked ? ' (locked)' : ''}`,
      ),
      'Review game locks and apply in your league app.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      onNotice('Lineup copied. Review and apply it in your league app.');
    } catch {
      onNotice(
        'Copy is unavailable in this browser. Your lineup is shown below.',
      );
    }
  };
  return (
    <>
      <div className="lab-toolbar">
        <Select value={l.id} onValueChange={(v) => v && onSelect(v)}>
          <SelectTrigger className="league-select" aria-label="Choose league">
            <SelectValue>
              {l.name} · {l.platform.toUpperCase()}
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
        <a
          className="external-button"
          href={l.url}
          target="_blank"
          rel="noreferrer"
        >
          Open {l.platform === 'espn' ? 'ESPN' : 'Sleeper'}{' '}
          <ExternalLink size={14} />
        </a>
      </div>
      <div className="lab-banner">
        <div>
          <PlatformTag value={l.platform} />
          <h2>{l.teamName}</h2>
          <p>
            {l.scoring} · {l.record} record
          </p>
        </div>
        <div className="lab-totals">
          <div>
            <span>CURRENT · PROVIDER PTS</span>
            <b>{number(a.currentTotal)}</b>
          </div>
          <ArrowRight size={22} />
          <div>
            <span>
              {actionable ? 'SUGGESTED · PROVIDER PTS' : 'ROSTER REFERENCE'}
            </span>
            <b className="green-text">
              {actionable ? number(a.recommendedTotal) : '—'}
            </b>
          </div>
        </div>
      </div>
      {l.error && (
        <div className="alert error">
          <Unplug size={18} />
          <p>
            {l.error}
            {l.stale ? ' Showing an older snapshot.' : ''}
          </p>
        </div>
      )}
      <Tabs value={mode} onValueChange={(v) => setMode(String(v))}>
        <TabsList variant="line">
          <TabsTrigger value="lineup">Lineup</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>
        <TabsContent value="lineup">
          <div className="lab-layout">
            <div>
              <section className="panel lineup-panel">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">SLOT BY SLOT</div>
                    <h2>
                      {actionable
                        ? 'Your lineup comparison'
                        : 'Your roster reference'}
                    </h2>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copy}
                    disabled={!actionable}
                  >
                    <Copy size={13} />
                    <span>Copy</span>
                  </Button>
                </div>
                <p className="muted">
                  {actionable
                    ? 'Compare provider point estimates below. Apply the full suggested lineup in your league app, including FLEX moves.'
                    : 'Choose the current week and refresh successfully to compare suggested starters.'}
                </p>
                <Table
                  className="responsive-table lineup-table"
                  aria-label="Current and suggested starters"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slot</TableHead>
                      <TableHead>Current starter</TableHead>
                      <TableHead className="points-col">Est. pts</TableHead>
                      <TableHead>
                        {actionable ? 'Suggested starter' : 'Reference'}
                      </TableHead>
                      <TableHead className="points-col">Est. pts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {a.assignments.map((row) => {
                      const changed =
                        actionable && row.current?.id !== row.recommended?.id;
                      return (
                        <TableRow
                          key={row.slot.id}
                          className={changed ? 'changed-row' : ''}
                        >
                          <TableCell data-label="Roster slot">
                            <span className="slot-badge">{row.slot.label}</span>
                            {row.locked && (
                              <LockKeyhole size={11} className="slot-lock" />
                            )}
                          </TableCell>
                          <TableCell data-label="Current starter">
                            <PlayerName player={row.current} />
                            {row.current && (
                              <Kickoff player={row.current} now={now} />
                            )}
                          </TableCell>
                          <TableCell
                            data-label="Current est. pts"
                            className="points-col"
                          >
                            {row.current?.partial ? '~' : ''}
                            {number(row.current?.projection)}
                          </TableCell>
                          <TableCell data-label="Suggested starter / status">
                            {changed ? (
                              <>
                                <PlayerName player={row.recommended} />
                                {row.recommended && (
                                  <Kickoff player={row.recommended} now={now} />
                                )}
                              </>
                            ) : (
                              <span className="keep-label">
                                {row.locked ? (
                                  <>
                                    <LockKeyhole size={12} />
                                    Locked in place
                                  </>
                                ) : row.current ? (
                                  <>
                                    <Check size={13} />
                                    {!actionable
                                      ? 'Reference only'
                                      : row.current.projection === null ||
                                          row.current.partial
                                        ? 'Held · projection incomplete'
                                        : row.current.locked === null
                                          ? 'Held · lock unknown'
                                          : 'Keep in lineup'}
                                  </>
                                ) : (
                                  'No eligible option'
                                )}
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            data-label="Suggested est. pts"
                            className="points-col"
                          >
                            {changed
                              ? number(row.recommended?.projection)
                              : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {!l.slots.length && (
                  <div className="empty-state">
                    <Unplug size={28} />
                    <h3>Waiting for this roster.</h3>
                    <p>
                      Refresh the connection to load starters and bench players.
                    </p>
                  </div>
                )}
              </section>
              <section className="panel bench-panel">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">KNOW YOUR OPTIONS</div>
                    <h2>Bench, reserve & taxi</h2>
                  </div>
                  <span className="count-pill">
                    {l.players.filter((p) => !p.slot).length}
                  </span>
                </div>
                <Table
                  className="responsive-table bench-table"
                  aria-label="Bench and reserve players"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Game lock</TableHead>
                      <TableHead className="points-col">Est. pts</TableHead>
                      <TableHead className="points-col">Actual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {l.players
                      .filter((p) => !p.slot)
                      .sort(
                        (a, b) =>
                          (b.projection ?? -Infinity) -
                          (a.projection ?? -Infinity),
                      )
                      .map((p) => (
                        <TableRow key={p.id}>
                          <TableCell data-label="Player">
                            <PlayerName player={p} />
                          </TableCell>
                          <TableCell data-label="Game lock">
                            <Kickoff player={p} now={now} />
                          </TableCell>
                          <TableCell
                            data-label="Provider est. pts"
                            className="points-col"
                          >
                            {p.partial ? '~' : ''}
                            {number(p.projection)}
                          </TableCell>
                          <TableCell
                            data-label="Actual pts"
                            className="points-col"
                          >
                            {number(p.actual)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </section>
            </div>
            <aside className="lab-insights">
              <section className="panel recommendation-panel">
                <span className="insight-icon">
                  <Zap size={22} />
                </span>
                <div className="eyebrow">THE LINEUP READ</div>
                <h2>
                  {!actionable
                    ? 'Reference mode'
                    : a.changes.length
                      ? 'Suggested lineup changes'
                      : 'Keep your current lineup'}
                </h2>
                {actionable && a.gain !== null && a.gain > 0.05 && (
                  <div className="gain-number">
                    +{number(a.gain)}
                    <small>projected pts</small>
                  </div>
                )}
                <p>
                  {!actionable
                    ? 'Lineup changes are not suggested for this view.'
                    : a.changes.length
                      ? `${a.changes.map((p) => p.name).join(', ')} enter the suggested lineup. Review the slot assignments before making changes.`
                      : a.complete
                        ? 'No higher projected legal combination was found among your available players.'
                        : 'No upgrade was found among the players we could evaluate. Missing data may hide a better option.'}
                </p>
                {a.removed.length > 0 && actionable && (
                  <p className="muted">
                    To bench: {a.removed.map((p) => p.name).join(', ')}.
                  </p>
                )}
                <div className="method-tag">
                  <ShieldCheck size={14} />
                  Provider estimates · league scoring
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="external-button full"
                >
                  Review in {l.platform === 'espn' ? 'ESPN' : 'Sleeper'}
                  <ArrowUpRight size={15} />
                </a>
                <p className="tiny">
                  Changes are applied in your league app. Projections are
                  estimates, not guaranteed results.
                </p>
              </section>
              <section className="panel checks-panel">
                <div className="eyebrow">BEFORE YOU LOCK IT IN</div>
                {a.issues.length ? (
                  a.issues.map((issue, i) => (
                    <div className="check-note" key={i}>
                      <CircleAlert size={15} />
                      <p>
                        <strong>{issue.player?.name ?? issue.slot}</strong>
                        <small>{issue.reason}</small>
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="check-note">
                    <CheckCheck size={16} />
                    <p>No starting-slot injury or bye warnings.</p>
                  </div>
                )}
                {[...a.reasons, ...l.warnings].map((reason, i) => (
                  <p key={i} className="caveat">
                    {reason}
                  </p>
                ))}
                <p className="source-note">
                  {l.source}
                  <br />
                  Roster synced {new Date(l.fetchedAt).toLocaleString()}
                  <br />~ marks an incomplete scoring estimate.
                </p>
              </section>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="standings">
          <section className="panel">
            <div className="section-head">
              <div>
                <div className="eyebrow">HOW YOU STACK UP</div>
                <h2>{l.name}</h2>
                <p className="muted">
                  Ordered by wins, then points for. League playoff tiebreakers
                  may differ.
                </p>
              </div>
              <Trophy size={24} />
            </div>
            <Table
              className="responsive-table standings-table"
              aria-label="League standings"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>W–L–T</TableHead>
                  <TableHead className="points-col">Points for</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {l.standings.map((team, i) => (
                  <TableRow
                    key={team.id}
                    className={team.mine ? 'my-standing' : ''}
                  >
                    <TableCell data-label="Rank">{i + 1}</TableCell>
                    <TableCell data-label="Team">
                      <strong>{team.name}</strong>
                      {team.mine && <span className="you-badge">YOU</span>}
                    </TableCell>
                    <TableCell data-label="Win–loss–tie">
                      {team.wins}–{team.losses}–{team.ties}
                    </TableCell>
                    <TableCell data-label="Points for" className="points-col">
                      {number(team.points)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!l.standings.length && (
              <p className="muted">
                Standings will appear after the league reconnects.
              </p>
            )}
          </section>
        </TabsContent>
        <TabsContent value="notes">
          <section className="panel notes-panel">
            <div className="eyebrow">YOUR CALL, CAPTAIN</div>
            <h2>Keep a game plan.</h2>
            <p className="muted">
              Save matchup ideas, waiver targets, and Sunday reminders for this
              league. Notes sync across your devices.
            </p>
            <label htmlFor="league-notes">League notes</label>
            <Textarea
              disabled={saving || !prefReady}
              id="league-notes"
              value={note}
              onChange={(e) => onNote(e.target.value)}
              maxLength={1500}
              placeholder="Watch the injury report. Revisit my FLEX before the late games…"
              rows={7}
            />
            <div className="notes-bottom">
              <small>{note.length} / 1,500</small>
              <Button onClick={onSave} disabled={saving || !prefReady}>
                {saving ? 'Saving…' : 'Save game plan'}
              </Button>
            </div>
            <div className="review-check">
              <Checkbox
                id="reviewed"
                checked={reviewed}
                onCheckedChange={(v) => onReviewed(v === true)}
                disabled={saving || !prefReady}
              />
              <label htmlFor="reviewed">
                I reviewed this league for week {l.week}
                <small>
                  A personal checklist. It does not confirm a lineup change in{' '}
                  {l.platform === 'espn' ? 'ESPN' : 'Sleeper'}.
                </small>
              </label>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Connections({
  leagues,
  warnings,
  onRefresh,
  loading,
}: {
  leagues: League[];
  warnings: string[];
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="connections-layout">
      <section className="panel">
        <div className="section-head">
          <div>
            <div className="eyebrow">LIVE DATA, CLEAR STATUS</div>
            <h2>Your league connections</h2>
            <SetupLink className="account-link">
              Choose leagues & manage accounts →
            </SetupLink>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} />
            Refresh
          </Button>
        </div>
        {leagues.map((l) => (
          <div className="connection-row" key={l.id}>
            <span
              className={`connection-icon ${l.error ? 'connection-bad' : ''}`}
            >
              {l.error ? <Unplug size={19} /> : <Check size={19} />}
            </span>
            <div>
              <strong>{l.name}</strong>
              <small>
                {l.platform.toUpperCase()} ·{' '}
                {l.error
                  ? l.error
                  : `${l.players.length} players · synced ${time(l.fetchedAt)}`}
              </small>
            </div>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${l.name} in ${l.platform}`}
            >
              <ArrowUpRight size={18} />
            </a>
          </div>
        ))}
        {warnings.map((w) => (
          <p className="caveat" key={w}>
            {w}
          </p>
        ))}
      </section>
      <section className="panel guide-panel">
        <div className="eyebrow">A SMARTER SUNDAY ROUTINE</div>
        <h2>Three minutes. Every league.</h2>
        <ol>
          <li>
            <b>Refresh before kickoff.</b>
            <p>
              Rosters, injuries, and projections can change. This page checks
              for updates every three minutes while visible.
            </p>
          </li>
          <li>
            <b>Work through the watchlist.</b>
            <p>
              Check empty slots, unavailable starters, and questionable players.
              Locked games stay fixed.
            </p>
          </li>
          <li>
            <b>Compare the whole lineup.</b>
            <p>
              The lineup lab maximizes projected points across eligible starter
              slots, including FLEX and superflex. Missing data is held out of
              swaps.
            </p>
          </li>
          <li>
            <b>Apply, then review.</b>
            <p>
              Set changes in ESPN or Sleeper, refresh here, and mark the week
              reviewed in My game plan.
            </p>
          </li>
        </ol>
      </section>
      <section className="panel guide-panel">
        <div className="eyebrow">BUILT TO BE TRANSPARENT</div>
        <h2>What’s behind the numbers?</h2>
        <p>
          <strong>ESPN:</strong> weekly projections scored for your specific
          league. Live matchup totals are separate from full-game lineup
          estimates.
        </p>
        <p>
          <strong>Sleeper:</strong> supplemental Rotowire projections, scored
          with your league settings. Missing or unmodeled stats may make an
          estimate incomplete.
        </p>
        <p>
          <strong>Game locks:</strong> ESPN roster locks and scheduled NFL
          kickoffs. Sleeper AutoSubs can add constraints; confirm them in
          Sleeper.
        </p>
        <p>
          <strong>Private access:</strong> ESPN sessions stay on the server.
          They can expire; <SetupLink>reconnect your account</SetupLink> to
          update the saved session.
        </p>
        <p className="tiny">
          Insights & waivers creates independent, league-scored estimates from
          past games and checks unrostered candidates. It does not submit lineup
          changes, claim waivers, or execute trades.
        </p>
        <a
          className="text-link"
          href="https://github.com/chris20ace/Fantasy_Football_Helper"
          target="_blank"
          rel="noreferrer"
        >
          Project & setup guide <ArrowUpRight size={14} />
        </a>
      </section>
    </div>
  );
}
