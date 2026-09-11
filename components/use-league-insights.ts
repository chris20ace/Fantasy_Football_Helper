'use client';
import { useEffect, useRef, useState } from 'react';
import type { InsightReport } from '@/lib/fantasy/projections';

export function useLeagueInsights(
  id: string,
  week: number,
  refreshKey: string,
) {
  const [report, setReport] = useState<InsightReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const previous = useRef({ id: '', week: 0, refreshKey: '', attempt: 0 });
  useEffect(() => {
    if (!id) return;
    const last = previous.current;
    const force =
      last.id === id &&
      last.week === week &&
      (last.attempt !== attempt || last.refreshKey !== refreshKey);
    previous.current = { id, week, refreshKey, attempt };
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      setReport(null);
      setError('');
      setLoading(true);
      try {
        const response = await fetch(
          `/api/insights?league=${encodeURIComponent(id)}&week=${week}${force ? '&refresh=1' : ''}`,
          { signal: controller.signal },
        );
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        const result = (await response.json()) as InsightReport & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? 'Recommendations could not load.');
        if (result.projectionSource !== 'provider')
          throw new Error(
            'Reload the app to load current provider projections.',
          );
        if (!controller.signal.aborted) setReport(result);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Recommendations could not load.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [id, week, refreshKey, attempt]);
  return {
    report:
      report?.league.id === id && report.league.week === week ? report : null,
    error,
    loading,
    refresh: () => setAttempt((v) => v + 1),
  };
}
export type LeagueInsightsState = ReturnType<typeof useLeagueInsights>;
