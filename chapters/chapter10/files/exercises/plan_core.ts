/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * A plan is what a query will read before it reads it: rows, the columns named, and the bytes per
 * row. No engine, no I/O, no clock.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Plan = {
  readonly rows: number;
  readonly columns: readonly string[];
  readonly bytesPerRow: number;
};

export function newPlan(rows: number, columns: readonly string[], bytesPerRow: number): Plan {
  if (!Number.isInteger(rows) || rows < 0) throw new Error(`rows: ${rows} is not a row count`);
  if (columns.length === 0) throw new Error("plan: at least one column is needed");
  if (!(bytesPerRow > 0)) throw new Error(`bytesPerRow: ${bytesPerRow} is not positive`);
  return { rows, columns: [...new Set(columns)], bytesPerRow };
}

export function scanBytes(plan: Plan): number {
  return plan.rows * plan.columns.length * plan.bytesPerRow;
}

export function scanMs(plan: Plan, throughputMbps: number): number {
  if (!(throughputMbps > 0)) throw new Error(`throughput: ${throughputMbps} is not positive`);
  return (scanBytes(plan) / (throughputMbps * 1_000_000)) * 1000;
}

export function fits(plan: Plan, budgetMs: number, throughputMbps: number): boolean {
  if (!(budgetMs > 0)) throw new Error(`budget: ${budgetMs} is not positive`);
  return scanMs(plan, throughputMbps) <= budgetMs;
}

export const checks: readonly Check[] = [
  {
    name: "a plan keeps its rows and its width",
    run: () => {
      const plan = newPlan(1_000_000, ["kind", "amount"], 4);
      return eq(scanBytes(plan), 8_000_000, "bytes");
    },
  },
  {
    name: "a repeated column does not widen the plan",
    run: () => eq(newPlan(10, ["kind", "kind"], 4).columns.length, 1, "columns"),
  },
  {
    name: "a million rows of two four-byte columns take 8 ms at a gigabyte a second",
    run: () => eq(scanMs(newPlan(1_000_000, ["kind", "amount"], 4), 1000), 8, "ms"),
  },
  {
    name: "a plan fits a budget exactly when its time does",
    run: () => {
      const plan = newPlan(1_000_000, ["kind", "amount"], 4);
      expect(fits(plan, 8, 1000), "should fit");
      return eq(fits(plan, 7, 1000), false, "should not fit");
    },
  },
  {
    name: "a plan with no columns is refused",
    run: () => {
      const error = throws(() => newPlan(10, [], 4), "empty");
      return expect(error.message.includes("at least one"), error.message);
    },
  },
];
