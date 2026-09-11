'use client';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { LeagueInsightsState } from './use-league-insights';
import type { League } from '@/lib/fantasy/types';
import RosterConstruction from './roster-construction';
const EMPTY: string[] = [];
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
  protectedByLeague,
  onProtect,
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
  protectedByLeague: Record<string, string[]>;
  onProtect: (leagueId: string, playerId: string) => void;
}) {
  const active = leagues.find((l) => l.id === selected) ?? leagues[0];
  const { report, error, loading } = state;
  const refresh =
    blocked || active?.stale || active?.error ? onRefresh : state.refresh;
  const valid =
    report?.projectionSource === 'provider' &&
    report.league.id === active?.id &&
    report.league.week === week &&
    report.league.season === active?.season
      ? report
      : null;
  const stale =
    blocked ||
    !!active?.stale ||
    !!active?.error ||
    !valid ||
    !Number.isFinite(Date.parse(valid.fetchedAt)) ||
    now - Date.parse(valid.fetchedAt) > 300000;
  if (!active)
    return (
      <div className="panel insight-empty">
        Connect a league to build its roster plan.
      </div>
    );
  const protect = (id: string) => onProtect(active.id, id);
  return (
    <div className="insights-workspace">
      <div className="insight-toolbar">
        <Select value={active.id} onValueChange={(v) => v && onSelect(v)}>
          <SelectTrigger aria-label="League for roster plan">
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
          Refresh roster plan
        </Button>
      </div>
      {loading && (
        <div className="panel insight-empty" aria-live="polite">
          <RefreshCw className="spin" size={28} />
          <h2>Building this team’s roster plan</h2>
          <p>
            Checking your lineup, available players, bench replacements and
            upcoming byes.
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
      {valid && (
        <>
          {stale && (
            <div className="alert" aria-live="polite">
              Refresh waivers before acting. This is a previous snapshot.
            </div>
          )}
          <RosterConstruction
            report={valid}
            stale={stale}
            now={now}
            onLineup={onLineup}
            protectedIds={protectedByLeague[active.id] ?? EMPTY}
            onProtect={protect}
          />
        </>
      )}
    </div>
  );
}
