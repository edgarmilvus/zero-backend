/**
 * Example 1 - four workers, twelve tasks, one queue.
 *
 *   node chapters/chapter18/files/01_pool.ts
 */

import { Pool } from "./pool.ts";
import { fakeWorker } from "./fake.ts";
import { renderStats } from "./report.ts";

export async function main(): Promise<number> {
  const pool = new Pool(4, () => fakeWorker((payload) => (payload as number) * 2).worker);
  const tasks = Array.from({ length: 12 }, (_, index) => pool.run<number>({ id: `t${index}`, payload: index }));

  // Before awaiting: four running, eight queued. That is the pool's shape, and the queue is the signal.
  console.log(`queued at start   ${pool.queued}`);
  const values = await Promise.all(tasks);

  console.log(renderStats(pool.stats()));
  console.log("");
  console.log(`results           ${values.join(",")}`);
  console.log("four workers, twelve results, and the queue drained");

  pool.close();
  return values.length === 12 && pool.stats().queued === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
