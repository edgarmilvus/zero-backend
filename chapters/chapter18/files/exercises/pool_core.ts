/**
 * Exercise 5, file 1 of 3 - the pure part.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Stats = { readonly running: number; readonly queued: number; readonly done: number };

export function depth(accepted: number, workers: number): Stats {
  if (!Number.isInteger(accepted) || accepted < 0) throw new Error(`accepted: ${accepted} is not a count`);
  if (!Number.isInteger(workers) || workers < 1) throw new Error(`workers: ${workers} is not a count`);
  return { running: Math.min(workers, accepted), queued: Math.max(0, accepted - workers), done: 0 };
}

export function percentiles(values: readonly number[]): { p50: number; p95: number } {
  if (values.length === 0) return { p50: 0, p95: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const at = (share: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)] as number;
  return { p50: at(0.5), p95: at(0.95) };
}

export function fits(frameMs: number, budgetMs: number): boolean {
  if (!(frameMs >= 0) || !(budgetMs > 0)) throw new Error("frame: expected a duration and a budget");
  return frameMs <= budgetMs;
}

export const checks: readonly Check[] = [
  { name: "four workers take four of ten", run: () => eq(depth(10, 4).running, 4, "running") },
  { name: "and queue six", run: () => eq(depth(10, 4).queued, 6, "queued") },
  { name: "two tasks on four workers queue none", run: () => eq(depth(2, 4).queued, 0, "queued") },
  { name: "a negative count is refused", run: () => {
    const error = throws(() => depth(-1, 4), "negative");
    return expect(error.message.includes("count"), error.message);
  } },
  { name: "an empty list has zero percentiles", run: () => eq(percentiles([]).p95, 0, "p95") },
];
