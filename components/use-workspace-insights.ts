'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { InsightQueue } from '@/lib/fantasy/insight-queue';
import type {
  InsightEntries,
  InsightTarget,
} from '@/lib/fantasy/insight-queue';
import type { League } from '@/lib/fantasy/types';
import type { LeagueInsightsState } from './use-league-insights';
const EMPTY: InsightEntries = {};

export function useWorkspaceInsights(
  leagues: League[],
  week: number,
  refreshKey: string,
  scope: string,
  selected: string,
) {
  const targetsKey = JSON.stringify(leagues.map((l) => [l.id, l.season, week]));
  const targets = useMemo(
    () =>
      (JSON.parse(targetsKey) as [string, number, number][]).map(
        ([id, season, targetWeek]) => ({ id, season, week: targetWeek }),
      ),
    [targetsKey],
  );
  const key = JSON.stringify([scope, targetsKey, refreshKey]);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    entries: InsightEntries;
  }>({ key: '', entries: {} });
  const queue = useRef<InsightQueue | null>(null);
  const previous = useRef({ scope: '', targetsKey: '', refreshKey: '' });
  useEffect(() => {
    const last = previous.current;
    const force =
      last.scope === scope &&
      last.targetsKey === targetsKey &&
      last.refreshKey !== refreshKey;
    previous.current = { scope, targetsKey, refreshKey };
    const instance = new InsightQueue({
      fetch: (input, init) => fetch(input, init),
      onChange: (entries) => setSnapshot({ key, entries }),
      onUnauthorized: () => window.location.replace('/login'),
    });
    queue.current = instance;
    // Keep effects independent of selecting a detail tab: it uses this same scan.
    queueMicrotask(() => {
      if (queue.current === instance)
        instance.replace(targets as InsightTarget[], force);
    });
    return () => {
      instance.dispose();
      if (queue.current === instance) queue.current = null;
    };
  }, [key, targets, targetsKey, scope, refreshKey]);
  useEffect(() => {
    queue.current?.prioritize(selected);
  }, [selected, key]);
  const entries = snapshot.key === key ? snapshot.entries : EMPTY;
  const stateFor = (id: string): LeagueInsightsState => {
    const entry = entries[id];
    return {
      report: entry?.report ?? null,
      error: entry?.error ?? '',
      loading: !entry || entry.phase === 'queued' || entry.phase === 'loading',
      refresh: () => queue.current?.retry(id),
    };
  };
  return { entries, stateFor, retry: (id: string) => queue.current?.retry(id) };
}
