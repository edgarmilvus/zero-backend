/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * A load record says which thread did the work, how long it took, what the longest frame was, and how
 * long one embedding took. The validation refuses a record whose numbers contradict the mode: a main
 * thread that reports a sixteen millisecond gap did not do the work.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type LoadRecord = {
  readonly mode: "worker" | "main";
  readonly loadMs: number;
  readonly maxFrameGapMs: number;
  readonly embedMs: number;
  readonly dims: number;
};

type Bag = Record<string, unknown>;

export function validateLoad(raw: unknown): LoadRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("load: expected an object");
  const root = raw as Bag;

  if (root.mode !== "worker" && root.mode !== "main") {
    throw new Error(`load.mode: expected worker or main, got ${String(root.mode)}`);
  }
  const number = (value: unknown, path: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${path}: expected a non-negative number`);
    }
    return value;
  };

  const record: LoadRecord = {
    mode: root.mode,
    loadMs: number(root.loadMs, "load.loadMs"),
    maxFrameGapMs: number(root.maxFrameGapMs, "load.maxFrameGapMs"),
    embedMs: number(root.embedMs, "load.embedMs"),
    dims: number(root.dims, "load.dims"),
  };

  if (record.dims !== 384) throw new Error(`load.dims: ${record.dims}, this model has 384`);
  if (record.loadMs === 0) throw new Error("load.loadMs: 0 means nothing was measured");
  if (record.mode === "main" && record.maxFrameGapMs < 100) {
    throw new Error(`load.maxFrameGapMs: ${record.maxFrameGapMs} on the main thread means the model did not load there`);
  }
  if (record.mode === "worker" && record.maxFrameGapMs >= 100) {
    throw new Error(`load.maxFrameGapMs: a worker stalled the page for ${record.maxFrameGapMs} ms`);
  }

  return record;
}

export function readLoad(path: string): LoadRecord {
  return validateLoad(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: LoadRecord): { queriesPerSecond: number; loadShare: number } {
  return {
    queriesPerSecond: record.embedMs === 0 ? 0 : 1000 / record.embedMs,
    loadShare: record.loadMs / (record.loadMs + record.embedMs),
  };
}

export const GOOD = { mode: "worker", loadMs: 1009, maxFrameGapMs: 16.7, embedMs: 98, dims: 384 };

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  { name: "a complete worker record is accepted", run: () => eq(validateLoad(GOOD).mode, "worker", "mode") },
  { name: "a main-thread record with a small gap is refused", run: () => {
    const error = throws(() => validateLoad(mutate((c) => (c.mode = "main"))), "main");
    return expect(error.message.includes("did not load there"), error.message);
  } },
  { name: "a worker record with a freeze is refused", run: () => {
    const error = throws(() => validateLoad(mutate((c) => (c.maxFrameGapMs = 614))), "worker freeze");
    return expect(error.message.includes("stalled"), error.message);
  } },
  { name: "a zero load time is refused", run: () => {
    const error = throws(() => validateLoad(mutate((c) => (c.loadMs = 0))), "zero");
    return expect(error.message.includes("nothing was measured"), error.message);
  } },
  { name: "another model's dimensions are refused", run: () => {
    const error = throws(() => validateLoad(mutate((c) => (c.dims = 768))), "dims");
    return expect(error.message.includes("384"), error.message);
  } },
  { name: "normalize derives the throughput and the load share", run: () => eq(Object.keys(normalize(validateLoad(GOOD))).join(","), "queriesPerSecond,loadShare", "keys") },
];
