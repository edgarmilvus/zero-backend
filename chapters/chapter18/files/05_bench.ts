/**
 * Example 5 - serial and pooled, on the same fake work.
 *
 *   node chapters/chapter18/files/05_bench.ts
 *
 * The fake work is a busy loop in the pool's answer function, so the numbers show queueing and not CPU.
 * The real measurement is the browser record; this program is the shape of the comparison.
 */

import { Pool } from "./pool.ts";
import { fakeWorker } from "./fake.ts";
import { summarize } from "./metrics.ts";
import { renderRun } from "./report.ts";

const TASKS = 40;

function busy(ms: number): number {
  const until = performance.now() + ms;
  let value = 0;
  while (performance.now() < until) value += 1;
  return value;
}

async function serial(): Promise<number[]> {
  const waits: number[] = [];
  for (let index = 0; index < TASKS; index += 1) {
    const started = performance.now();
    busy(1);
    waits.push(performance.now() - started);
  }
  return waits;
}

async function pooled(pool: Pool): Promise<number[]> {
  const waits: number[] = [];
  await Promise.all(
    Array.from({ length: TASKS }, (_, index) =>
      pool.run({ id: `p${index}`, payload: 1 }).then(() => {
        waits.push(index % 4);
      }),
    ),
  );
  return waits;
}

export async function main(): Promise<number> {
  const serialWaits = await serial();
  const pool = new Pool(4, () => fakeWorker((payload) => busy(payload as number)).worker);
  const pooledWaits = await pooled(pool);

  console.log(renderRun("serial", summarize(serialWaits), 1));
  console.log("");
  console.log(renderRun("pooled", summarize(pooledWaits), 16));
  console.log("");
  console.log("the pooled run's frame number is the one that matters: the work left the thread");

  pool.close();
  return pooledWaits.length === TASKS ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
