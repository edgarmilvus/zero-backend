/**
 * A serial queue, because one ONNX session runs one inference at a time.
 *
 * The worker receives messages as they arrive; a second `embed` posted while the first is running
 * would either interleave inside the session or be silently dropped. The queue makes the concurrency
 * a policy: one task at a time, in order, and a depth a page can show.
 */

export type Queued<T> = () => Promise<T>;

export class SerialQueue {
  #tail: Promise<unknown> = Promise.resolve();
  #pending = 0;
  #maxDepth = 0;

  get pending(): number {
    return this.#pending;
  }

  /** The largest number of tasks that were waiting at once, which is the number a spinner shows. */
  get maxDepth(): number {
    return this.#maxDepth;
  }

  push<T>(task: Queued<T>): Promise<T> {
    if (typeof task !== "function") throw new Error("queue: a task must be a function");
    this.#pending += 1;
    this.#maxDepth = Math.max(this.#maxDepth, this.#pending);

    const run = this.#tail.then(task, task);
    // The chain must continue after a rejection, or one failed embedding stops every later one.
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(() => {
      this.#pending -= 1;
    });
  }
}
