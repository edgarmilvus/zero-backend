/**
 * The pool: one queue, N workers, and a promise per task.
 *
 * The pool owns no policy beyond "worker free, take the next task". Ordering is the scheduler's job and
 * the limit is the producer's, which is why this file is small: a pool that tries to be both becomes a
 * scheduler that hides its queue.
 */

export type WorkerLike = {
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  terminate(): void;
};

export type Task = {
  readonly id: string;
  readonly payload: unknown;
  /** Bytes moved to the worker; transferred when the payload is an ArrayBuffer. */
  readonly transfer?: readonly ArrayBuffer[];
};

export type PoolStats = {
  readonly workers: number;
  readonly running: number;
  readonly queued: number;
  readonly done: number;
  readonly failed: number;
  readonly longestWaitMs: number;
};

type Pending = {
  task: Task;
  enqueuedAt: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type Slot = {
  worker: WorkerLike;
  current: Pending | null;
};

export class Pool {
  readonly #slots: Slot[] = [];
  readonly #queue: Pending[] = [];
  #done = 0;
  #failed = 0;
  #longestWait = 0;
  #closed = false;

  readonly #now: () => number;

  constructor(size: number, factory: () => WorkerLike, now: () => number = () => Date.now()) {
    if (!Number.isInteger(size) || size < 1) throw new Error(`pool: size ${size} is not a worker count`);
    this.#now = now;
    for (let index = 0; index < size; index += 1) {
      const worker = factory();
      const slot: Slot = { worker, current: null };
      worker.onmessage = (event) => this.#settle(slot, event.data);
      this.#slots.push(slot);
    }
  }

  /** The queue's depth is the backpressure signal a producer reads before posting more. */
  get queued(): number {
    return this.#queue.length;
  }

  get running(): number {
    return this.#slots.filter((slot) => slot.current !== null).length;
  }

  run<T>(task: Task): Promise<T> {
    if (this.#closed) return Promise.reject(new Error("pool: closed"));
    if (task.id.trim() === "") return Promise.reject(new Error("pool: a task needs an id"));

    return new Promise<T>((resolve, reject) => {
      const pending: Pending = {
        task,
        enqueuedAt: this.#now(),
        resolve: resolve as (value: unknown) => void,
        reject,
      };
      const slot = this.#slots.find((candidate) => candidate.current === null);
      if (slot) this.#start(slot, pending);
      else this.#queue.push(pending);
    });
  }

  /**
   * Cancellation takes the task out of the queue, or tells the worker to stop at its next checkpoint.
   * The worker is never terminated: a slot is worth more than a task.
   */
  cancel(id: string): boolean {
    const index = this.#queue.findIndex((pending) => pending.task.id === id);
    if (index >= 0) {
      const [pending] = this.#queue.splice(index, 1);
      pending?.reject(new Error(`pool: ${id} cancelled before it started`));
      return true;
    }
    const slot = this.#slots.find((candidate) => candidate.current?.task.id === id);
    if (slot?.current) {
      slot.worker.postMessage({ type: "cancel", id });
      return true;
    }
    return false;
  }

  stats(): PoolStats {
    return {
      workers: this.#slots.length,
      running: this.running,
      queued: this.#queue.length,
      done: this.#done,
      failed: this.#failed,
      longestWaitMs: this.#longestWait,
    };
  }

  close(): void {
    this.#closed = true;
    for (const pending of this.#queue.splice(0)) pending.reject(new Error("pool: closed"));
    for (const slot of this.#slots) {
      // A running task is terminated with its worker; its promise has to settle or the caller waits
      // forever for a worker that no longer exists.
      if (slot.current) {
        slot.current.reject(new Error("pool: closed"));
        slot.current = null;
      }
      slot.worker.terminate();
    }
  }

  #start(slot: Slot, pending: Pending): void {
    slot.current = pending;
    this.#longestWait = Math.max(this.#longestWait, this.#now() - pending.enqueuedAt);
    slot.worker.postMessage({ type: "run", id: pending.task.id, payload: pending.task.payload }, pending.task.transfer);
  }

  #settle(slot: Slot, data: unknown): void {
    const message = data as { id?: string; ok?: boolean; value?: unknown; error?: string };
    const pending = slot.current;
    if (!pending || message.id !== pending.task.id) return;

    slot.current = null;
    if (message.ok === false) {
      this.#failed += 1;
      pending.reject(new Error(message.error ?? "worker failed"));
    } else {
      this.#done += 1;
      pending.resolve(message.value);
    }

    const next = this.#queue.shift();
    if (next) this.#start(slot, next);
  }
}
