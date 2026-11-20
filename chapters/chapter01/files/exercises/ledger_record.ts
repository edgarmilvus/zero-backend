/**
 * Exercise 5, file 2 of 3 - the effect, and the schema.
 *
 * This file owns two things and nothing else: reading bytes off the disk, and
 * refusing a record that would put a number into the book without a machine, an
 * input and a result behind it. It knows nothing about tariffs or costs.
 *
 * A refusal names the field. "Invalid record" is not a message; it is a shrug.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type RecordSchema = {
  readonly id: string;
  readonly chapter: number;
  readonly engine: string;
  readonly input: {
    readonly name: string;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly result: {
    readonly wallClockMs: number;
    readonly peakHeapBytes: number;
    readonly sha256: string;
  };
};

type Bag = Record<string, unknown>;

function bag(value: unknown, path: string): Bag {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Bag;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path}: expected a non-empty string`);
  }
  return value;
}

function count(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}: expected a finite number`);
  }
  return value;
}

/** Every field the book's fifth column depends on, checked by name. */
export function validateRecord(raw: unknown): RecordSchema {
  const root = bag(raw, "record");
  const input = bag(root.input, "record.input");
  const result = bag(root.result, "record.result");

  return {
    id: text(root.id, "record.id"),
    chapter: count(root.chapter, "record.chapter"),
    engine: text(root.engine, "record.engine"),
    input: {
      name: text(input.name, "record.input.name"),
      bytes: count(input.bytes, "record.input.bytes"),
      sha256: text(input.sha256, "record.input.sha256"),
    },
    result: {
      wallClockMs: count(result.wallClockMs, "record.result.wallClockMs"),
      peakHeapBytes: count(result.peakHeapBytes, "record.result.peakHeapBytes"),
      sha256: text(result.sha256, "record.result.sha256"),
    },
  };
}

/** The only function here that touches the disk. */
export function readRecord(path: string): RecordSchema {
  return validateRecord(JSON.parse(readFileSync(path, "utf8")));
}

/** The four numbers the client column needs, in the shape the ledger wants. */
export function normalize(record: RecordSchema): {
  wallClockMs: number;
  peakHeapBytes: number;
  bytes: number;
  sha256: string;
} {
  return {
    wallClockMs: record.result.wallClockMs,
    peakHeapBytes: record.result.peakHeapBytes,
    bytes: record.input.bytes,
    sha256: record.result.sha256,
  };
}

// --- the tests this file owns -------------------------------------------------
//
// Six checks, all on literals: the schema is exercised without a file, and the
// file is exercised once, by the wiring, at the end of the run.

export const GOOD = {
  id: "reel-120mb",
  chapter: 1,
  engine: "node",
  input: { name: "reel.mp4", bytes: 120_000_000, sha256: "a".repeat(64) },
  result: { wallClockMs: 412.5, peakHeapBytes: 130_000_000, sha256: "b".repeat(64) },
};

function mutate(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete record is accepted",
    run: () => eq(validateRecord(GOOD).id, "reel-120mb", "id"),
  },
  {
    name: "a missing wall clock is refused by name",
    run: () => {
      const broken = mutate((copy) => {
        const result = copy.result as Record<string, unknown>;
        delete result.wallClockMs;
      });
      const error = throws(() => validateRecord(broken), "missing wall clock");
      return expect(error.message.includes("result.wallClockMs"), error.message);
    },
  },
  {
    name: "a non-numeric wall clock is refused",
    run: () => {
      const broken = mutate((copy) => {
        (copy.result as Record<string, unknown>).wallClockMs = "412.5 ms";
      });
      const error = throws(() => validateRecord(broken), "string wall clock");
      return expect(error.message.includes("finite number"), error.message);
    },
  },
  {
    name: "a missing input digest is refused by name",
    run: () => {
      const broken = mutate((copy) => {
        const input = copy.input as Record<string, unknown>;
        delete input.sha256;
      });
      const error = throws(() => validateRecord(broken), "missing digest");
      return expect(error.message.includes("input.sha256"), error.message);
    },
  },
  {
    name: "an array is not a record",
    run: () => {
      const error = throws(() => validateRecord([]), "array");
      return expect(error.message.includes("expected an object"), error.message);
    },
  },
  {
    name: "normalize returns the four numbers and nothing else",
    run: () =>
      eq(
        Object.keys(normalize(validateRecord(GOOD))).join(","),
        "wallClockMs,peakHeapBytes,bytes,sha256",
        "keys",
      ),
  },
];

