/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * A query record says what ran, how many rows came back, how many columns it read, how many bytes
 * those columns were, and how long it took. Reading it is easy; refusing a query that read more
 * bytes than the file holds is the work.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type QueryRecord = {
  readonly query: string;
  readonly format: "table" | "parquet" | "csv";
  readonly rows: number;
  readonly columnsRead: number;
  readonly bytes: number;
  readonly fileBytes: number;
  readonly ms: number;
};

type Bag = Record<string, unknown>;

function bag(value: unknown, path: string): Bag {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Bag;
}

function count(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path}: expected a non-negative number`);
  }
  return value;
}

export function validateQuery(raw: unknown): QueryRecord {
  const root = bag(raw, "query");

  if (typeof root.query !== "string" || root.query.trim() === "") {
    throw new Error("query.query: expected the SQL that ran");
  }
  if (root.format !== "table" && root.format !== "parquet" && root.format !== "csv") {
    throw new Error(`query.format: expected table, parquet or csv, got ${String(root.format)}`);
  }

  const record: QueryRecord = {
    query: root.query,
    format: root.format,
    rows: count(root.rows, "query.rows"),
    columnsRead: count(root.columnsRead, "query.columnsRead"),
    bytes: count(root.bytes, "query.bytes"),
    fileBytes: count(root.fileBytes, "query.fileBytes"),
    ms: count(root.ms, "query.ms"),
  };

  if (!Number.isInteger(record.rows)) throw new Error("query.rows: expected a whole number of rows");
  if (!Number.isInteger(record.columnsRead)) throw new Error("query.columnsRead: expected a whole number");
  if (record.columnsRead === 0) throw new Error("query.columnsRead: 0 means the query read nothing");
  if (record.columnsRead > 5) {
    throw new Error(`query.columnsRead: ${record.columnsRead} columns, but events has five`);
  }
  if (record.bytes > record.fileBytes) {
    throw new Error(
      `query.bytes: ${record.bytes} bytes read from a ${record.fileBytes} byte file, so the plan overcounted`,
    );
  }

  return record;
}

/** The only function here that touches the disk. */
export function readQuery(path: string): QueryRecord {
  return validateQuery(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: QueryRecord): { megabytes: number; mbPerSecond: number; msPerRow: number } {
  const megabytes = record.bytes / 1_000_000;
  return {
    megabytes,
    mbPerSecond: record.ms === 0 ? 0 : megabytes / (record.ms / 1000),
    msPerRow: record.rows === 0 ? 0 : record.ms / record.rows,
  };
}

// --- the tests this file owns -------------------------------------------------

export const GOOD = {
  query: "select kind, count(*) from events group by kind",
  format: "parquet",
  rows: 7,
  columnsRead: 2,
  bytes: 2_422_153,
  fileBytes: 2_422_153,
  ms: 74,
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete record is accepted",
    run: () => eq(validateQuery(GOOD).format, "parquet", "format"),
  },
  {
    name: "more bytes than the file holds is refused",
    run: () => {
      const error = throws(() => validateQuery(mutate((copy) => (copy.fileBytes = 1_000_000))), "overcount");
      return expect(error.message.includes("overcounted"), error.message);
    },
  },
  {
    name: "a query that read no columns is refused",
    run: () => {
      const error = throws(() => validateQuery(mutate((copy) => (copy.columnsRead = 0))), "none");
      return expect(error.message.includes("read nothing"), error.message);
    },
  },
  {
    name: "more columns than the table has is refused",
    run: () => {
      const error = throws(() => validateQuery(mutate((copy) => (copy.columnsRead = 6))), "six");
      return expect(error.message.includes("five"), error.message);
    },
  },
  {
    name: "an unknown format is refused",
    run: () => {
      const error = throws(() => validateQuery(mutate((copy) => (copy.format = "avro"))), "format");
      return expect(error.message.includes("table, parquet or csv"), error.message);
    },
  },
  {
    name: "normalize derives megabytes and throughput",
    run: () =>
      eq(
        Object.keys(normalize(validateQuery(GOOD))).join(","),
        "megabytes,mbPerSecond,msPerRow",
        "keys",
      ),
  },
];
