/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * An index record says which model built it, how many dimensions, how many vectors, how many bytes
 * each one takes, and what recall the quantized copy achieved. The validation is the exercise: a
 * record whose arithmetic disagrees with itself is a record that will be quoted wrongly.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type IndexRecord = {
  readonly model: string;
  readonly dims: number;
  readonly vectors: number;
  readonly bytesPerVector: 4 | 1;
  readonly vectorBytes: number;
  readonly recall: number;
};

type Bag = Record<string, unknown>;

function bag(value: unknown, path: string): Bag {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Bag;
}

function count(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${path}: expected a non-negative integer`);
  }
  return value;
}

export function validateIndex(raw: unknown): IndexRecord {
  const root = bag(raw, "index");

  if (typeof root.model !== "string" || root.model.trim() === "") {
    throw new Error("index.model: expected the model that produced the vectors");
  }
  if (root.bytesPerVector !== 4 && root.bytesPerVector !== 1) {
    throw new Error(`index.bytesPerVector: expected 4 or 1, got ${String(root.bytesPerVector)}`);
  }

  const record: IndexRecord = {
    model: root.model,
    dims: count(root.dims, "index.dims"),
    vectors: count(root.vectors, "index.vectors"),
    bytesPerVector: root.bytesPerVector,
    vectorBytes: count(root.vectorBytes, "index.vectorBytes"),
    recall: typeof root.recall === "number" ? root.recall : Number.NaN,
  };

  if (record.dims === 0) throw new Error("index.dims: 0 dimensions is not an embedding");
  if (record.vectors === 0) throw new Error("index.vectors: an index with no vectors is not an index");

  const expectedBytes = record.vectors * record.dims * record.bytesPerVector;
  if (record.vectorBytes !== expectedBytes) {
    throw new Error(
      `index.vectorBytes: ${record.vectorBytes} bytes for ${record.vectors} x ${record.dims} x ` +
        `${record.bytesPerVector}, which is ${expectedBytes}`,
    );
  }
  if (typeof root.recall !== "number" || !Number.isFinite(root.recall) || root.recall < 0 || root.recall > 1) {
    throw new Error(`index.recall: ${String(root.recall)} is not a share between 0 and 1`);
  }

  return record;
}

/** The only function here that touches the disk. */
export function readIndex(path: string): IndexRecord {
  return validateIndex(JSON.parse(readFileSync(path, "utf8")));
}

export function normalizeRecord(record: IndexRecord): { kilobytes: number; bytesPerQuery: number } {
  return {
    kilobytes: record.vectorBytes / 1024,
    bytesPerQuery: record.dims * 4,
  };
}

export const GOOD = {
  model: "Xenova/all-MiniLM-L6-v2",
  dims: 384,
  vectors: 40,
  bytesPerVector: 4,
  vectorBytes: 40 * 384 * 4,
  recall: 1,
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete record is accepted",
    run: () => eq(validateIndex(GOOD).model, "Xenova/all-MiniLM-L6-v2", "model"),
  },
  {
    name: "a byte count that disagrees with rows and dimensions is refused",
    run: () => {
      const error = throws(() => validateIndex(mutate((copy) => (copy.vectorBytes = 1000))), "bytes");
      return expect(error.message.includes("which is"), error.message);
    },
  },
  {
    name: "a recall above one is refused",
    run: () => {
      const error = throws(() => validateIndex(mutate((copy) => (copy.recall = 1.2))), "recall");
      return expect(error.message.includes("between 0 and 1"), error.message);
    },
  },
  {
    name: "a representation that is neither four nor one byte is refused",
    run: () => {
      const error = throws(() => validateIndex(mutate((copy) => (copy.bytesPerVector = 2))), "width");
      return expect(error.message.includes("4 or 1"), error.message);
    },
  },
  {
    name: "an index with no vectors is refused",
    run: () => {
      const error = throws(() => validateIndex(mutate((copy) => { copy.vectors = 0; copy.vectorBytes = 0; })), "empty");
      return expect(error.message.includes("not an index"), error.message);
    },
  },
  {
    name: "normalize derives kilobytes and the query size",
    run: () =>
      eq(
        Object.keys(normalizeRecord(validateIndex(GOOD))).join(","),
        "kilobytes,bytesPerQuery",
        "keys",
      ),
  },
];
