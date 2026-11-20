/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * A database record says the version, the row count, the load time and where it persisted. Reading it
 * is easy; refusing one whose count is smaller than what was inserted is the work.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type DbRecord = {
  readonly engine: string;
  readonly version: number;
  readonly inserted: number;
  readonly rows: number;
  readonly loadMs: number;
  readonly persisted: "memory" | "opfs";
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

export function validateDb(raw: unknown): DbRecord {
  const root = bag(raw, "db");

  if (typeof root.engine !== "string" || root.engine === "") {
    throw new Error("db.engine: expected a non-empty string");
  }
  if (root.persisted !== "memory" && root.persisted !== "opfs") {
    throw new Error(`db.persisted: expected memory or opfs, got ${String(root.persisted)}`);
  }

  const record: DbRecord = {
    engine: root.engine,
    version: count(root.version, "db.version"),
    inserted: count(root.inserted, "db.inserted"),
    rows: count(root.rows, "db.rows"),
    loadMs: count(root.loadMs, "db.loadMs"),
    persisted: root.persisted,
  };

  if (record.version === 0) {
    throw new Error("db.version: 0 means the migrations never ran");
  }
  if (record.rows < record.inserted) {
    throw new Error(
      `db.rows: ${record.rows} rows for ${record.inserted} inserts, so something was lost`,
    );
  }

  return record;
}

/** The only function here that touches the disk. */
export function readDb(path: string): DbRecord {
  return validateDb(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: DbRecord): {
  perRowMs: number;
  keptShare: number;
  version: number;
} {
  return {
    perRowMs: record.rows === 0 ? 0 : record.loadMs / Math.max(1, record.inserted),
    keptShare: record.inserted === 0 ? 1 : Math.min(1, record.rows / record.inserted),
    version: record.version,
  };
}

// --- the tests this file owns -------------------------------------------------

export const GOOD = {
  engine: "pglite",
  version: 3,
  inserted: 1000,
  rows: 1000,
  loadMs: 1603,
  persisted: "opfs",
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete record is accepted",
    run: () => eq(validateDb(GOOD).engine, "pglite", "engine"),
  },
  {
    name: "a row count below the inserted count is refused",
    run: () => {
      const error = throws(() => validateDb(mutate((c) => (c.rows = 999))), "lost rows");
      return expect(error.message.includes("something was lost"), error.message);
    },
  },
  {
    name: "a version of zero is refused",
    run: () => {
      const error = throws(() => validateDb(mutate((c) => (c.version = 0))), "version");
      return expect(error.message.includes("never ran"), error.message);
    },
  },
  {
    name: "a persistence that is neither memory nor opfs is refused",
    run: () => {
      const error = throws(() => validateDb(mutate((c) => (c.persisted = "indexeddb"))), "persisted");
      return expect(error.message.includes("memory or opfs"), error.message);
    },
  },
  {
    name: "a fractional count is refused",
    run: () => {
      const error = throws(() => validateDb(mutate((c) => (c.rows = 1.5))), "fraction");
      return expect(error.message.includes("integer"), error.message);
    },
  },
  {
    name: "normalize derives the per-row time and the kept share",
    run: () =>
      eq(
        Object.keys(normalize(validateDb(GOOD))).join(","),
        "perRowMs,keptShare,version",
        "keys",
      ),
  },
];
