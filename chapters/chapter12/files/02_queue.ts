/**
 * Example 2 - one inference at a time.
 *
 *   node chapters/chapter12/files/02_queue.ts
 *
 * Five tasks arrive at once and each takes a different time. The queue runs them in order, one at a
 * time, and records the deepest the line got: that depth is what a page shows as "2 waiting".
 */

import { SerialQueue } from "./queue.ts";

const DELAYS = [40, 10, 30, 5, 20];

export async function main(): Promise<number> {
  const queue = new SerialQueue();
  const finished: string[] = [];
  let running = 0;
  let overlapped = false;

  const started = performance.now();
  const results = await Promise.all(
    DELAYS.map((delay, index) =>
      queue.push(async () => {
        running += 1;
        if (running > 1) overlapped = true;
        await new Promise((resolve) => setTimeout(resolve, delay));
        running -= 1;
        finished.push(`task ${index}`);
        return index;
      }),
    ),
  );
  const elapsed = performance.now() - started;

  console.log(`tasks             ${results.length}, all resolved`);
  console.log(`order             ${finished.join(", ")}`);
  console.log(`deepest queue     ${queue.maxDepth}`);
  console.log(`elapsed           ${elapsed.toFixed(0)} ms, the sum of the delays`);
  console.log("");
  console.log("one inference at a time: the second message waits instead of corrupting the first");

  const ordered = finished.join(",") === DELAYS.map((_delay, index) => `task ${index}`).join(",");
  return !overlapped && ordered && queue.maxDepth === DELAYS.length ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
