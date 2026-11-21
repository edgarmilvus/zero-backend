/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type AppRecord = {
  readonly bytes: number;
  readonly budget: number;
  readonly modules: number;
  readonly notes: number;
  readonly verdict: "fits" | "over";
};

export function validateApp(raw: unknown): AppRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("app: expected an object");
  const root = raw as Record<string, unknown>;
  const count = (value: unknown, path: string): number => {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new Error(`${path}: expected a positive integer`);
    }
    return value;
  };

  const record: AppRecord = {
    bytes: count(root.bytes, "app.bytes"),
    budget: count(root.budget, "app.budget"),
    modules: count(root.modules, "app.modules"),
    notes: count(root.notes, "app.notes"),
    verdict: root.verdict === "fits" ? "fits" : root.verdict === "over" ? "over" : ("?" as never),
  };

  if (record.verdict !== "fits" && record.verdict !== "over") {
    throw new Error(`app.verdict: expected fits or over, got ${String(root.verdict)}`);
  }
  if (record.verdict === "fits" && record.bytes > record.budget) {
    throw new Error(`app.verdict: fits but ${record.bytes} > ${record.budget}`);
  }
  if (record.verdict === "over" && record.bytes <= record.budget) {
    throw new Error(`app.verdict: over but ${record.bytes} <= ${record.budget}`);
  }

  return record;
}

export function readApp(path: string): AppRecord {
  return validateApp(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: AppRecord): { share: number; perModule: number } {
  return { share: record.bytes / record.budget, perModule: record.bytes / record.modules };
}

export const GOOD = { bytes: 14_376, budget: 100_000, modules: 3, notes: 2, verdict: "fits" };

function mutate(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  { name: "a complete record is accepted", run: () => eq(validateApp(GOOD).modules, 3, "modules") },
  { name: "a fits verdict over the budget is refused", run: () => {
    const error = throws(() => validateApp(mutate((c) => (c.bytes = 120_000))), "contradiction");
    return expect(error.message.includes("fits but"), error.message);
  } },
  { name: "an over verdict under the budget is refused", run: () => {
    const error = throws(() => validateApp(mutate((c) => (c.verdict = "over"))), "contradiction");
    return expect(error.message.includes("over but"), error.message);
  } },
  { name: "an unknown verdict is refused", run: () => {
    const error = throws(() => validateApp(mutate((c) => (c.verdict = "maybe"))), "verdict");
    return expect(error.message.includes("fits or over"), error.message);
  } },
  { name: "zero modules is refused", run: () => {
    const error = throws(() => validateApp(mutate((c) => (c.modules = 0))), "modules");
    return expect(error.message.includes("positive"), error.message);
  } },
  { name: "normalize derives the share and the average module", run: () => eq(Object.keys(normalize(validateApp(GOOD))).sort().join(","), "perModule,share", "keys") },
];
