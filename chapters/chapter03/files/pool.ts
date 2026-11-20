/**
 * A pool of workers with one message protocol.
 *
 * The pool owns the threads and nothing else: it does not know what a job is, and it does not
 * schedule. `createScheduler` decides how many may run; the pool provides the workers they run
 * on. That split is why a fake worker can replace Chrome in the harness without touching the
 * queue, and why the queue can be tested without a thread at all.
 */

/** The four members this file needs from a Worker, and nothing else. */
export type WorkerLike = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  terminate(): void;
};

export class PoolError extends Error {
  readonly jobId: string;

  constructor(jobId: string, message: string) {
    super(`worker pool, job ${jobId}: ${message}`);
    this.name = "PoolError";
    this.jobId = jobId;
  }
}

export type Pool = {
  readonly size: number;
  /** Sends one job to a worker and resolves with the value the worker sent back. */
  run<T>(id: string, payload: unknown): Promise<T>;
  /** Jobs sent and not yet answered. */
  readonly pending: number;
  close(): void;
};

type Reply = { id?: string; ok?: boolean; value?: unknown; error?: string };

/**
 * Creates a pool over a factory, so the caller decides what a worker is.
 *
 * One listener per worker, attached once, and a map from job id to the promise it will settle.
 * A reply whose id is not in the map is dropped: a worker that answers twice is a bug in the
 * worker, not a reason to crash the pool.
 */
export function createPool(factory: () => WorkerLike, size: number): Pool {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`pool size: expected a positive integer, got ${size}`);
  }

  const workers: WorkerLike[] = Array.from({ length: size }, () => factory());
  const inflight = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let next = 0;
  let closed = false;

  for (const worker of workers) {
    worker.addEventListener("message", (event: MessageEvent) => {
      const reply = event.data as Reply;
      if (typeof reply.id !== "string") return;
      const entry = inflight.get(reply.id);
      if (!entry) return;
      inflight.delete(reply.id);
      if (reply.ok === false) {
        entry.reject(new PoolError(reply.id, reply.error ?? "worker reported a failure"));
        return;
      }
      entry.resolve(reply.value);
    });
  }

  return {
    size,
    run<T>(id: string, payload: unknown): Promise<T> {
      if (closed) return Promise.reject(new PoolError(id, "the pool is closed"));

      const worker = workers[next % workers.length];
      next += 1;
      if (!worker) return Promise.reject(new PoolError(id, "no worker available"));

      return new Promise<T>((resolve, reject) => {
        inflight.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        worker.postMessage({ id, payload });
      });
    },
    get pending() {
      return inflight.size;
    },
    close() {
      closed = true;
      for (const worker of workers) worker.terminate();
      for (const [id, entry] of inflight) {
        entry.reject(new PoolError(id, "the pool was closed before the answer arrived"));
      }
      inflight.clear();
    },
  };
}

export function poolSize(pool: Pool): number {
  return pool.size;
}
