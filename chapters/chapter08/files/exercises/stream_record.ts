/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * A stream record says the size, the chunk size, the count and the digest. Reading it is easy; refusing
 * one whose chunk count does not cover its size is the work.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type StreamRecord = {
  readonly path: string;
  readonly sizeBytes: number;
  readonly chunkBytes: number;
  readonly chunks: number;
  readonly digest: string;
  readonly peakBytes: number;
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

export function validateStream(raw: unknown): StreamRecord {
  const root = bag(raw, "stream");

  if (typeof root.path !== "string" || root.path === "") {
    throw new Error("stream.path: expected a non-empty string");
  }
  if (typeof root.digest !== "string" || root.digest.length !== 64) {
    throw new Error("stream.digest: expected a 64-character hex digest");
  }

  const record: StreamRecord = {
    path: root.path,
    sizeBytes: positive(root.sizeBytes, "stream.sizeBytes"),
    chunkBytes: positive(root.chunkBytes, "stream.chunkBytes"),
    chunks: positive(root.chunks, "stream.chunks"),
    digest: root.digest,
    peakBytes: positive(root.peakBytes, "stream.peakBytes"),
  };

  const expected = Math.ceil(record.sizeBytes / record.chunkBytes);
  if (record.chunks !== expected) {
    throw new Error(
      `stream.chunks: ${record.chunks} does not cover ${record.sizeBytes} at ${record.chunkBytes} bytes, which needs ${expected}`,
    );
  }
  if (record.peakBytes > record.chunkBytes * 2) {
    throw new Error("stream.peakBytes: more than two chunks held, which a chunked read cannot do");
  }

  return record;
}

/** The only function here that touches the disk. */
export function readStream(path: string): StreamRecord {
  return validateStream(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: StreamRecord): {
  chunks: number;
  bytesPerChunk: number;
  digestPrefix: string;
} {
  return {
    chunks: record.chunks,
    bytesPerChunk: Math.round(record.sizeBytes / record.chunks),
    digestPrefix: record.digest.slice(0, 16),
  };
}

// --- the tests this file owns -------------------------------------------------

export const GOOD = {
  path: "/tmp/zero1g.bin",
  sizeBytes: 1_073_741_824,
  chunkBytes: 67_108_864,
  chunks: 16,
  digest: "a".repeat(64),
  peakBytes: 134_217_728,
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete record is accepted",
    run: () => eq(validateStream(GOOD).chunks, 16, "chunks"),
  },
  {
    name: "a chunk count that does not cover the size is refused",
    run: () => {
      const error = throws(() => validateStream(mutate((c) => (c.chunks = 15))), "short");
      return expect(error.message.includes("does not cover"), error.message);
    },
  },
  {
    name: "a digest that is not 64 characters is refused",
    run: () => {
      const error = throws(() => validateStream(mutate((c) => (c.digest = "abc"))), "digest");
      return expect(error.message.includes("64-character"), error.message);
    },
  },
  {
    name: "a peak above two chunks is refused",
    run: () => {
      const error = throws(() => validateStream(mutate((c) => (c.peakBytes = 1e9))), "peak");
      return expect(error.message.includes("two chunks"), error.message);
    },
  },
  {
    name: "an empty path is refused",
    run: () => {
      const error = throws(() => validateStream(mutate((c) => (c.path = ""))), "path");
      return expect(error.message.includes("stream.path"), error.message);
    },
  },
  {
    name: "normalize derives the per-chunk average and the digest prefix",
    run: () =>
      eq(
        Object.keys(normalize(validateStream(GOOD))).join(","),
        "chunks,bytesPerChunk,digestPrefix",
        "keys",
      ),
  },
];
