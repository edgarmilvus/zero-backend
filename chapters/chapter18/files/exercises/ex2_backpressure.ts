/**
 * Exercise 2 - the producer that outran the pool.
 *
 * A loop that posts a thousand tasks without awaiting anything builds a queue of a thousand and a
 * memory spike. The fix is a limit the producer can read.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Stats = { queued: number; running: number };

/** The bug: the producer never looks at the queue. */
export function flood(total: number, workers: number): Stats {
  return { queued: total - workers, running: workers };
}

/** The repair: the producer waits when the queue reaches its limit. */
export function paced(total: number, workers: number, limit: number): { accepted: number; deepest: number } {
  if (limit < 1) throw new Error(`limit: ${limit} is not a positive depth`);
  let queued = 0;
  let deepest = 0;
  let accepted = 0;
  for (let index = 0; index < total; index += 1) {
    if (queued >= limit) {
      deepest = Math.max(deepest, queued);
      queued = 0; // the producer drained the queue by awaiting
    }
    accepted += 1;
    queued += 1;
  }
  return { accepted, deepest: Math.max(deepest, queued) };
}

export const checks: readonly Check[] = [
  { name: "the flood builds a queue of a thousand", run: () => eq(flood(1_000, 4).queued, 996, "queued") },
  { name: "the paced producer accepts everything", run: () => eq(paced(1_000, 4, 8).accepted, 1_000, "accepted") },
  { name: "and never exceeds the limit", run: () => expect(paced(1_000, 4, 8).deepest <= 8, `${paced(1_000, 4, 8).deepest}`) },
  { name: "the deepest queue is the limit", run: () => eq(paced(1_000, 4, 8).deepest, 8, "deepest") },
  { name: "a limit of one is serial", run: () => eq(paced(10, 1, 1).deepest, 1, "deepest") },
  { name: "a zero limit is refused", run: () => {
    const error = throws(() => paced(1, 1, 0), "zero");
    return expect(error.message.includes("depth"), error.message);
  } },
  { name: "the flood has no limit to exceed", run: () => expect(flood(1_000, 4).queued > 8, "small") },
  { name: "the paced producer's queue is bounded by the limit", run: () => expect(paced(100, 4, 5).deepest <= 5, "over") },
  { name: "an empty run accepts nothing", run: () => eq(paced(0, 4, 8).accepted, 0, "accepted") },
];

export function main(): number {
  console.log(`flood             ${flood(1_000, 4).queued} queued`);
  console.log(`paced             deepest ${paced(1_000, 4, 8).deepest}`);
  console.log("");
  console.log("the queue is only a signal if the producer is allowed to read it");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
