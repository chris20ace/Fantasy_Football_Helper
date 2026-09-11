import type { InsightReport } from './projections.ts';

export type InsightTarget = { id: string; season: number; week: number };
export type InsightEntry = {
  target: InsightTarget;
  phase: 'queued' | 'loading' | 'ready' | 'error';
  report: InsightReport | null;
  error: string;
};
export type InsightEntries = Record<string, InsightEntry>;
type QueueOptions = {
  fetch: typeof fetch;
  onChange: (entries: InsightEntries) => void;
  onUnauthorized: () => void;
  concurrency?: number;
  timeoutMs?: number;
};

/** One dashboard/session owns this queue. No module cache or browser storage. */
export class InsightQueue {
  private generation = 0;
  private entries: InsightEntries = {};
  private pending: { target: InsightTarget; force: boolean }[] = [];
  private running = new Set<AbortController>();
  private disposed = false;
  private priority = '';
  private options: QueueOptions;

  constructor(options: QueueOptions) {
    this.options = options;
  }

  replace(targets: InsightTarget[], force = false) {
    this.dispose();
    this.disposed = false;
    this.entries = Object.fromEntries(
      targets.map((target) => [
        target.id,
        { target, phase: 'queued', report: null, error: '' },
      ]),
    );
    this.pending = [
      ...new Map(
        targets.map((target) => [target.id, { target, force }]),
      ).values(),
    ];
    this.publish();
    this.pump();
  }

  prioritize(id: string) {
    this.priority = id;
    this.pump();
  }

  retry(id: string) {
    const old = this.entries[id];
    if (
      !old ||
      old.phase === 'loading' ||
      old.phase === 'queued' ||
      this.disposed
    )
      return;
    this.entries = {
      ...this.entries,
      [id]: { ...old, phase: 'queued', report: null, error: '' },
    };
    this.pending.push({ target: old.target, force: true });
    this.priority = id;
    this.publish();
    this.pump();
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    for (const controller of this.running) controller.abort();
    this.running.clear();
    this.pending = [];
  }

  private publish() {
    if (!this.disposed) this.options.onChange({ ...this.entries });
  }

  private pump() {
    const limit = Math.max(1, Math.min(3, this.options.concurrency ?? 3));
    while (!this.disposed && this.running.size < limit && this.pending.length) {
      const index = this.pending.findIndex(
        (job) => job.target.id === this.priority,
      );
      const job = this.pending.splice(index < 0 ? 0 : index, 1)[0];
      const controller = new AbortController();
      this.running.add(controller);
      const generation = this.generation;
      this.entries = {
        ...this.entries,
        [job.target.id]: {
          target: job.target,
          phase: 'loading',
          report: null,
          error: '',
        },
      };
      this.publish();
      void this.request(job, controller, generation);
    }
  }

  private async request(
    job: { target: InsightTarget; force: boolean },
    controller: AbortController,
    generation: number,
  ) {
    const current = () =>
      !this.disposed &&
      generation === this.generation &&
      this.entries[job.target.id]?.target === job.target;
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 45000,
    );
    const clearTimer = () => clearTimeout(timeout);
    controller.signal.addEventListener('abort', clearTimer, { once: true });
    try {
      const response = await this.options.fetch(
        `/api/insights?league=${encodeURIComponent(job.target.id)}&week=${job.target.week}${job.force ? '&refresh=1' : ''}`,
        { signal: controller.signal },
      );
      if (!current()) return;
      if (response.status === 401) {
        this.dispose();
        this.options.onUnauthorized();
        return;
      }
      const report = (await response.json()) as InsightReport & {
        error?: string;
      };
      if (!current()) return;
      if (!response.ok)
        throw new Error(
          report.error || 'This league could not be checked. Try again.',
        );
      if (
        report.projectionSource !== 'provider' ||
        report.league?.id !== job.target.id ||
        report.league.week !== job.target.week ||
        report.league.season !== job.target.season ||
        !Array.isArray(report.league.players) ||
        !Array.isArray(report.league.slots) ||
        !Array.isArray(report.candidates)
      )
        throw new Error(
          'The returned report did not match this league and week. Refresh this league.',
        );
      this.entries = {
        ...this.entries,
        [job.target.id]: {
          target: job.target,
          phase: 'ready',
          report,
          error: '',
        },
      };
    } catch (error) {
      if (current())
        this.entries = {
          ...this.entries,
          [job.target.id]: {
            target: job.target,
            phase: 'error',
            report: null,
            error: controller.signal.aborted
              ? 'This league took too long to respond. Try again.'
              : error instanceof Error
                ? error.message
                : 'This league could not be checked.',
          },
        };
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', clearTimer);
      this.running.delete(controller);
      if (current()) this.publish();
      this.pump();
    }
  }
}
