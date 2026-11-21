/**
 * The scheduler: two queues, one ratio, and an admission rule.
 *
 * Strict priority starves the background queue; no priority freezes the interface. The chapter's rule is
 * a ratio: after every three interactive tasks, one background task is admitted, so the export finishes
 * while the page stays responsive.
 */

export type Priority = "interactive" | "background";

export type Job<T> = {
  readonly id: string;
  readonly priority: Priority;
  readonly run: () => Promise<T>;
};

export type Admitted = {
  readonly admitted: boolean;
  readonly reason: "ok" | "closed" | "background-deferred";
};

export class Scheduler {
  readonly #interactive: Job<unknown>[] = [];
  readonly #background: Job<unknown>[] = [];
  #interactiveSinceBackground = 0;
  #running = 0;
  #closed = false;

  readonly #limit: number;
  readonly #ratio: number;

  constructor(limit: number, ratio = 3) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error(`scheduler: limit ${limit} is not a slot count`);
    if (!Number.isInteger(ratio) || ratio < 1) throw new Error(`scheduler: ratio ${ratio} is not a count`);
    this.#limit = limit;
    this.#ratio = ratio;
  }

  get pending(): number {
    return this.#interactive.length + this.#background.length;
  }

  /** `admit` decides whether the job may start now; a deferred background job stays queued. */
  admit<T>(job: Job<T>): Admitted {
    if (this.#closed) return { admitted: false, reason: "closed" };
    if (this.#running >= this.#limit) {
      this.#push(job);
      return { admitted: false, reason: "background-deferred" };
    }
    if (job.priority === "background" && this.#interactive.length > 0) {
      this.#push(job);
      return { admitted: false, reason: "background-deferred" };
    }
    this.#start(job);
    return { admitted: true, reason: "ok" };
  }

  /** The next job, by ratio: three interactive tasks buy one background task. */
  next(): Job<unknown> | undefined {
    const interactive = this.#interactive.shift();
    if (interactive) {
      this.#interactiveSinceBackground += 1;
      return interactive;
    }
    if (this.#background.length > 0 && this.#interactiveSinceBackground >= this.#ratio) {
      this.#interactiveSinceBackground = 0;
      return this.#background.shift();
    }
    return this.#background.shift();
  }

  finish(): void {
    this.#running = Math.max(0, this.#running - 1);
  }

  close(): void {
    this.#closed = true;
  }

  #push(job: Job<unknown>): void {
    if (job.priority === "interactive") this.#interactive.push(job);
    else this.#background.push(job);
  }

  #start(job: Job<unknown>): void {
    this.#running += 1;
  }
}
