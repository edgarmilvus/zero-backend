/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * A job record says what was transcoded and what it cost. Reading it is easy; refusing one whose
 * numbers contradict each other is the work, and the refusal has to name the field.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type JobRecord = {
  readonly input: string;
  readonly output: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly wallClockMs: number;
  readonly mediaMs: number;
};

type Bag = Record<string, unknown>;

function bag(value: unknown, path: string): Bag {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Bag;
}

function positive(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path}: expected a positive number`);
  }
  return value;
}

export function validateJob(raw: unknown): JobRecord {
  const root = bag(raw, "job");

  for (const field of ["input", "output"] as const) {
    const value = root[field];
    if (typeof value !== "string" || value === "") {
      throw new Error(`job.${field}: expected a non-empty string`);
    }
  }

  const record: JobRecord = {
    input: root.input as string,
    output: root.output as string,
    inputBytes: positive(root.inputBytes, "job.inputBytes"),
    outputBytes: positive(root.outputBytes, "job.outputBytes"),
    wallClockMs: positive(root.wallClockMs, "job.wallClockMs"),
    mediaMs: positive(root.mediaMs, "job.mediaMs"),
  };

  if (record.input === record.output) {
    throw new Error("job.output: it is the input, so the record describes a job that ate its file");
  }

  return record;
}

/** The only function here that touches the disk. */
export function readJob(path: string): JobRecord {
  return validateJob(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: JobRecord): {
  ratio: number;
  speedup: number;
  totalMs: number;
} {
  return {
    ratio: record.inputBytes / record.outputBytes,
    speedup: record.mediaMs / record.wallClockMs,
    totalMs: record.wallClockMs,
  };
}

// --- the tests this file owns -------------------------------------------------

export const GOOD = {
  input: "reel.mp4",
  output: "reel-out.mp4",
  inputBytes: 200_000,
  outputBytes: 50_000,
  wallClockMs: 2000,
  mediaMs: 4000,
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete record is accepted",
    run: () => eq(validateJob(GOOD).input, "reel.mp4", "input"),
  },
  {
    name: "a missing output size is refused by name",
    run: () => {
      const error = throws(() => validateJob(mutate((c) => delete c.outputBytes)), "no size");
      return expect(error.message.includes("job.outputBytes"), error.message);
    },
  },
  {
    name: "a zero wall clock is refused",
    run: () => {
      const error = throws(() => validateJob(mutate((c) => (c.wallClockMs = 0))), "zero");
      return expect(error.message.includes("positive"), error.message);
    },
  },
  {
    name: "a record whose output is its input is refused",
    run: () => {
      const error = throws(() => validateJob(mutate((c) => (c.output = c.input as string))), "same");
      return expect(error.message.includes("ate its file"), error.message);
    },
  },
  {
    name: "an array is not a record",
    run: () => {
      const error = throws(() => validateJob([]), "array");
      return expect(error.message.includes("expected an object"), error.message);
    },
  },
  {
    name: "normalize derives the two ratios and no third number",
    run: () =>
      eq(
        Object.keys(normalize(validateJob(GOOD))).join(","),
        "ratio,speedup,totalMs",
        "keys",
      ),
  },
];
