/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type PoolRecord = {
  readonly workers: number;
  readonly tasks: number;
  readonly longestFrameMs: number;
  readonly queuedAtEnd: number;
  readonly budgetMs: number;
};

export function validatePool(raw: unknown): PoolRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("pool: expected an object");
  const root = raw as Record<string, unknown>;
  const count = (value: unknown, path: string, min = 0): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
      throw new Error(`${path}: expected a number >= ${min}`);
    }
    return value;
  };

  const record: PoolRecord = {
    workers: count(root.workers, "pool.workers", 1),
    tasks: count(root.tasks, "pool.tasks", 1),
    longestFrameMs: count(root.longestFrameMs, "pool.longestFrameMs", 0),
    queuedAtEnd: count(root.queuedAtEnd, "pool.queuedAtEnd", 0),
    budgetMs: count(root.budgetMs, "pool.budgetMs", 1),
  };

  if (record.longestFrameMs > record.budgetMs) {
    throw new Error(`pool.longestFrameMs: ${record.longestFrameMs} over the ${record.budgetMs} ms budget`);
  }
  if (record.queuedAtEnd !== 0) {
    throw new Error(`pool.queuedAtEnd: ${record.queuedAtEnd} tasks left; the run did not finish`);
  }

  return record;
}

export function readPool(path: string): PoolRecord {
  return validatePool(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: PoolRecord): { tasksPerWorker: number; frameShare: number } {
  return { tasksPerWorker: record.tasks / record.workers, frameShare: record.longestFrameMs / record.budgetMs };
}

export const GOOD = { workers: 4, tasks: 40, longestFrameMs: 17, queuedAtEnd: 0, budgetMs: 100 };

function mutate(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  { name: "a complete record is accepted", run: () => eq(validatePool(GOOD).workers, 4, "workers") },
  { name: "a frame over the budget is refused", run: () => {
    const error = throws(() => validatePool(mutate((c) => (c.longestFrameMs = 120))), "frame");
    return expect(error.message.includes("budget"), error.message);
  } },
  { name: "a queue left at the end is refused", run: () => {
    const error = throws(() => validatePool(mutate((c) => (c.queuedAtEnd = 3))), "queue");
    return expect(error.message.includes("did not finish"), error.message);
  } },
  { name: "zero workers is refused", run: () => {
    const error = throws(() => validatePool(mutate((c) => (c.workers = 0))), "workers");
    return expect(error.message.includes(">= 1"), error.message);
  } },
  { name: "zero tasks is refused", run: () => {
    const error = throws(() => validatePool(mutate((c) => (c.tasks = 0))), "tasks");
    return expect(error.message.includes(">= 1"), error.message);
  } },
  { name: "normalize derives the per-worker load and the frame share", run: () => eq(Object.keys(normalize(validatePool(GOOD))).sort().join(","), "frameShare,tasksPerWorker", "keys") },
];
