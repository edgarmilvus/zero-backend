/**
 * Example 2 - the producer that outran the pool.
 *
 *   node chapters/chapter18/files/02_backpressure.ts
 *
 * Posting a thousand tasks is one loop and a thousand closures. The loop below awaits when the queue is
 * at its limit, which is the whole of backpressure: the producer reads the queue and waits.
 */

import { Pool } from "./pool.ts";
import { fakeWorker } from "./fake.ts";

const LIMIT = 8;

export async function main(): Promise<number> {
  const pool = new Pool(2, () => fakeWorker().worker);
  let deepest = 0;
  const results: number[] = [];

  for (let index = 0; index < 200; index += 1) {
    if (pool.queued >= LIMIT) {
      deepest = Math.max(deepest, pool.queued);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    pool.run({ id: `b${index}`, payload: index }).then((value) => results.push(value as number));
  }

  await new Promise((resolve) => setTimeout(resolve, 50));
  console.log(`tasks             ${results.length}`);
  console.log(`deepest queue     ${Math.max(deepest, LIMIT)} (limit ${LIMIT})`);
  console.log(`left in the pool  ${pool.queued}`);
  console.log("");
  console.log("a producer that never waits is a producer that builds a queue it cannot see");

  pool.close();
  return results.length === 200 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
