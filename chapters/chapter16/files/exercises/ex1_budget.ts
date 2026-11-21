/**
 * Exercise 1 - the budget that was a feeling.
 *
 * A size target with no measurement is a wish. The exercise turns the target into arithmetic: bytes
 * per module, a total, and a verdict that fails the build.
 */

import { eq, expect, near, throws, type Check } from "./selfcheck.ts";

export const BUDGET = 100_000;

export function total(parts: readonly number[]): number {
  for (const part of parts) {
    if (!Number.isInteger(part) || part < 0) throw new Error(`part: ${part} is not a size`);
  }
  return parts.reduce((sum, part) => sum + part, 0);
}

export function fits(bytes: number, budget = BUDGET): boolean {
  if (!Number.isInteger(bytes) || bytes < 0) throw new Error(`bytes: ${bytes} is not a size`);
  if (!Number.isInteger(budget) || budget <= 0) throw new Error(`budget: ${budget} is not a budget`);
  return bytes <= budget;
}

export function headroom(bytes: number, budget = BUDGET): number {
  return Math.max(0, budget - bytes);
}

export function perModule(bytes: number, modules: number): number {
  if (!Number.isInteger(modules) || modules <= 0) throw new Error(`modules: ${modules} is not a count`);
  return bytes / modules;
}

export const checks: readonly Check[] = [
  { name: "three parts sum", run: () => eq(total([3_000, 5_000, 7_000]), 15_000, "total") },
  { name: "an empty build is zero", run: () => eq(total([]), 0, "total") },
  { name: "a build under the budget fits", run: () => eq(fits(14_000), true, "fits") },
  { name: "a build over it does not", run: () => eq(fits(100_001), false, "fits") },
  { name: "the exact budget fits", run: () => eq(fits(100_000), true, "edge") },
  { name: "the headroom shrinks", run: () => eq(headroom(14_000), 86_000, "headroom") },
  { name: "a negative part is refused", run: () => {
    const error = throws(() => total([1, -1]), "negative");
    return expect(error.message.includes("size"), error.message);
  } },
  { name: "the per-module average is the total over the count", run: () => near(perModule(14_376, 3), 4_792, 1e-9, "average") },
];

export function main(): number {
  console.log(`total             ${total([3_000, 5_000, 7_000])} bytes`);
  console.log(`fits              ${fits(14_376)}`);
  console.log(`headroom          ${headroom(14_376)} bytes`);
  console.log("");
  console.log("a budget is a number the build can check");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
