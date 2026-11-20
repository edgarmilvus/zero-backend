/**
 * Exercise 3 - the cold start nobody sees twice.
 *
 * A worker that loads in a second is a page that is ready in a second, and a page that loads it on
 * every render is ready in a second, twenty times. The arithmetic is the chapter's decision.
 */

import { eq, expect, near, throws, type Check } from "./selfcheck.ts";

export const MB = 1024 * 1024;

/** Milliseconds to move `bytes` at `mbps`, which is what a 23 MB download costs on a slow link. */
export function transferMs(bytes: number, mbps: number): number {
  if (!(bytes >= 0)) throw new Error(`bytes: ${bytes} is not a size`);
  if (!(mbps > 0)) throw new Error(`mbps: ${mbps} is not a throughput`);
  // Megabits, not mebibytes: a byte is eight bits, and the link is sold in the smaller unit.
  return ((bytes * 8) / (mbps * 1_000_000)) * 1000;
}

/** The time a session spends before its last answer: one load plus one cost per query. */
export function sessionMs(loadMs: number, perQueryMs: number, queries: number): number {
  if (!Number.isInteger(queries) || queries < 0) throw new Error(`queries: ${queries} is not a count`);
  return loadMs + queries * perQueryMs;
}

/** The moment the model is worth opening at idle: when the session has a query at all. */
export function shouldWarm(loadMs: number, perQueryMs: number, queries: number): boolean {
  return queries > 0 && loadMs > 0 && perQueryMs > 0;
}

/** Two loads because a component mounted twice is two workers, and neither is freed. */
export function duplicateLoads(loadMs: number, mounts: number): number {
  if (!Number.isInteger(mounts) || mounts < 0) throw new Error(`mounts: ${mounts} is not a count`);
  return loadMs * mounts;
}

export const checks: readonly Check[] = [
  { name: "a 23 MB download at 10 Mbps is 18 seconds", run: () => near(transferMs(23_684_681, 10), 18_948, 1, "ms") },
  { name: "the same file at 100 Mbps is under two seconds", run: () => expect(transferMs(23_684_681, 100) < 2_000, "slow") },
  { name: "a zero throughput is refused", run: () => {
    const error = throws(() => transferMs(1, 0), "zero");
    return expect(error.message.includes("throughput"), error.message);
  } },
  { name: "a negative size is refused", run: () => {
    const error = throws(() => transferMs(-1, 10), "negative");
    return expect(error.message.includes("size"), error.message);
  } },
  { name: "a session with no queries costs nothing", run: () => eq(sessionMs(1_009, 98, 0), 1_009, "ms") },
  { name: "three queries cost the load plus three", run: () => eq(sessionMs(1_009, 98, 3), 1_303, "ms") },
  { name: "a negative query count is refused", run: () => {
    const error = throws(() => sessionMs(1, 1, -1), "negative");
    return expect(error.message.includes("count"), error.message);
  } },
  { name: "a page that never searches should not warm", run: () => eq(shouldWarm(1_009, 98, 0), false, "warm") },
  { name: "a search page should", run: () => eq(shouldWarm(1_009, 98, 3), true, "warm") },
  { name: "two mounts are two loads, not one", run: () => eq(duplicateLoads(1_009, 2), 2_018, "ms") },
];

export function main(): number {
  console.log(`23 MB at 10 Mbps  ${(transferMs(23_684_681, 10) / 1000).toFixed(1)} s`);
  console.log(`one load, 3 queries ${sessionMs(1_009, 98, 3)} ms`);
  console.log(`two mounts        ${duplicateLoads(1_009, 2)} ms`);
  console.log("");
  console.log("the model is opened once, and the effect that opens it runs once");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
