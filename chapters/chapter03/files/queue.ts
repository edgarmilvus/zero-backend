/**
 * The queue, with no worker and no I/O.
 *
 * Concurrency is the one thing a page cannot get by accident: four jobs at a time is a
 * decision, and the place it lives is here. The scheduler is a value and two functions, so the
 * harness can run a thousand ticks in a millisecond and the browser can run the same code
 * against a real pool.
 */

export type Job<T> = {
  readonly id: string;
  readonly run: () => T | Promise<T>;
};

export type JobState = "queued" | "running" | "done" | "failed";

export type JobRecord = {
  readonly id: string;
  state: JobState;
  startedAtMs: number | null;
  endedAtMs: number | null;
  error: string | null;
};

export type Stats = {
  readonly queued: number;
  readonly running: number;
  readonly done: number;
  readonly failed: number;
  readonly peakRunning: number;
};

export type Scheduler<T> = {
  readonly limit: number;
  readonly records: readonly JobRecord[];
  /** Starts as many queued jobs as the limit allows. Resolves when they have started. */
  pump(): Promise<void>;
  /** Pumps until nothing is queued or running, then returns the totals. */
  drain(): Promise<Stats>;
  stats(): Stats;
};

/**
 * One scheduler per page, and one limit.
 *
 * The jobs are started without being awaited, because the point is to have several of them
 * in flight; the records are mutated as they settle, so `stats()` is a read of the present
 * rather than a promise about the future.
 */
export function createScheduler<T>(limit: number, jobs: readonly Job<T>[]): Scheduler<T> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limit: expected a positive integer, got ${limit}`);
  }

  const records: JobRecord[] = jobs.map((job) => ({
    id: job.id,
    state: "queued",
    startedAtMs: null,
    endedAtMs: null,
    error: null,
  }));

  let peakRunning = 0;

  const count = (state: JobState): number =>
    records.filter((record) => record.state === state).length;

  async function pump(): Promise<void> {
    while (count("running") < limit) {
      const index = records.findIndex((record) => record.state === "queued");
      if (index < 0) return;

      const record = records[index];
      const job = jobs[index];
      if (!record || !job) return;

      record.state = "running";
      record.startedAtMs = Date.now();
      peakRunning = Math.max(peakRunning, count("running"));

      void (async () => {
        try {
          await job.run();
          record.state = "done";
        } catch (error) {
          record.state = "failed";
          record.error = (error as Error).message;
        } finally {
          record.endedAtMs = Date.now();
        }
      })();
    }
  }

  async function drain(): Promise<Stats> {
    await pump();
    while (count("queued") > 0 || count("running") > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await pump();
    }
    return stats();
  }

  function stats(): Stats {
    return {
      queued: count("queued"),
      running: count("running"),
      done: count("done"),
      failed: count("failed"),
      peakRunning,
    };
  }

  return { limit, records, pump, drain, stats };
}

export function submit<T>(limit: number, jobs: readonly Job<T>[]): Scheduler<T> {
  return createScheduler(limit, jobs);
}

export async function drain<T>(scheduler: Scheduler<T>): Promise<Stats> {
  return scheduler.drain();
}

export function stats<T>(scheduler: Scheduler<T>): Stats {
  return scheduler.stats();
}
