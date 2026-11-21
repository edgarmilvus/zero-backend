/**
 * Exercise 3 - the number that drifted.
 *
 * A claim with a threshold is a test; a claim with an exact number is a second copy of the record, and
 * the two drift the day the run is redone.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export function passes(value: number, min: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(min)) throw new Error("value: expected finite numbers");
  return value >= min;
}

export function exact(recorded: number, claimed: number): boolean {
  return recorded === claimed;
}

export function drift(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error("drift: different lengths");
  return a.reduce((worst, value, index) => Math.max(worst, Math.abs(value - (b[index] as number))), 0);
}

export const checks: readonly Check[] = [
  { name: "a value over the floor passes", run: () => eq(passes(14_376, 10_000), true, "pass") },
  { name: "a value under it does not", run: () => eq(passes(9_999, 10_000), false, "pass") },
  { name: "the floor itself passes", run: () => eq(passes(10_000, 10_000), true, "edge") },
  { name: "a non-finite value is refused", run: () => {
    const error = throws(() => passes(Number.NaN, 1), "nan");
    return expect(error.message.includes("finite"), error.message);
  } },
  { name: "an exact claim passes on the same number", run: () => eq(exact(14_376, 14_376), true, "exact") },
  { name: "and drifts one byte later", run: () => eq(exact(14_377, 14_376), false, "exact") },
  { name: "drift measures the worst difference", run: () => eq(drift([14_376, 42], [14_377, 40]), 2, "drift") },
  { name: "identical runs have no drift", run: () => eq(drift([1, 2], [1, 2]), 0, "drift") },
  { name: "different lengths are refused", run: () => {
    const error = throws(() => drift([1], [1, 2]), "lengths");
    return expect(error.message.includes("lengths"), error.message);
  } },
  { name: "a threshold survives a re-run that an exact claim would not", run: () => {
    const first = 14_376;
    const second = 14_380;
    return expect(passes(first, 10_000) && passes(second, 10_000) && !exact(second, first), "threshold");
  } },
];

export function main(): number {
  console.log(`threshold 10k     ${passes(14_376, 10_000)}`);
  console.log(`exact 14,376      ${exact(14_380, 14_376)}`);
  console.log("");
  console.log("a threshold is a test; an exact copy of a number is a second source of truth");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
