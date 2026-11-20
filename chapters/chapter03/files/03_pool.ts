/**
 * Example 3 - the pool, over a worker that answers.
 *
 *   node chapters/chapter03/files/03_pool.ts
 *
 * In node there is no `Worker` in the page's sense, so the factory builds a fake with the four
 * members the pool needs. That fake is the same shape the harness uses, and it is the reason
 * the pool can be tested on a machine that has no threads.
 */

import { createPool, type WorkerLike } from "./pool.ts";

/** A worker that doubles a number after a tick, with the same protocol as the real one. */
function fakeWorker(): WorkerLike {
  const listeners: ((event: MessageEvent) => void)[] = [];
  return {
    postMessage(message: unknown) {
      const { id, payload } = message as { id: string; payload: number };
      setTimeout(() => {
        for (const listener of listeners) {
          listener({ data: { id, ok: true, value: payload * 2 } } as MessageEvent);
        }
      }, 1);
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    terminate() {
      listeners.length = 0;
    },
  };
}

export async function main(): Promise<number> {
  const pool = createPool(fakeWorker, 3);

  const started = performance.now();
  const answers = await Promise.all(
    Array.from({ length: 9 }, (_, index) => pool.run<number>(`job-${index + 1}`, index + 1)),
  );
  const wallClockMs = performance.now() - started;

  console.log(`pool size        ${pool.size}`);
  console.log(`jobs             ${answers.length}`);
  console.log(`answers          ${answers.join(", ")}`);
  console.log(`pending          ${pool.pending}`);
  console.log(`wall clock       ${wallClockMs.toFixed(1)} ms`);
  console.log("");
  console.log("every answer is twice its payload, and the pool held nine jobs across three workers");

  pool.close();
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
