/**
 * Exercise 3 - the scan that is measured in megabytes.
 *
 * A query's cost is rows times the columns it reads times bytes per value, divided by how fast the
 * storage delivers them. A page that budgets milliseconds without budgeting bytes ships a scan of a
 * column nobody wanted, and blames the engine.
 */

import { eq, expect, near, throws, type Check } from "./selfcheck.ts";

/** Bytes per row in each format, from the chapter's record. */
export const PARQUET_BYTES_PER_ROW = 2.42;
export const CSV_BYTES_PER_ROW = 23.27;

/** The throughput the model assumes, in megabytes per second, for a warm file on a laptop SSD. */
export const THROUGHPUT_MBPS = 1_000;

export function formatBytes(rows: number, bytesPerRow: number): number {
  if (!Number.isInteger(rows) || rows < 0) throw new Error(`rows: ${rows} is not a row count`);
  if (!(bytesPerRow > 0)) throw new Error(`bytesPerRow: ${bytesPerRow} is not positive`);
  return rows * bytesPerRow;
}

export function scanMs(bytes: number, throughputMbps: number = THROUGHPUT_MBPS): number {
  if (!(throughputMbps > 0)) throw new Error(`throughput: ${throughputMbps} is not positive`);
  if (!(bytes >= 0)) throw new Error(`bytes: ${bytes} is not a size`);
  return bytes / (throughputMbps * 1_000_000) * 1000;
}

export function rowsInBudget(budgetMs: number, bytesPerRow: number, throughputMbps: number = THROUGHPUT_MBPS): number {
  if (!(budgetMs > 0)) throw new Error(`budget: ${budgetMs} is not positive`);
  return Math.floor((budgetMs / 1000) * throughputMbps * 1_000_000 / bytesPerRow);
}

export function timeRatio(parquetRows: number, csvRows: number): number {
  return formatBytes(csvRows, CSV_BYTES_PER_ROW) / formatBytes(parquetRows, PARQUET_BYTES_PER_ROW);
}

export const checks: readonly Check[] = [
  {
    name: "a million rows in parquet are 2.4 MB",
    run: () => near(formatBytes(1_000_000, PARQUET_BYTES_PER_ROW) / 1_000_000, 2.42, 1e-9, "MB"),
  },
  {
    name: "the same rows in csv are 23.3 MB",
    run: () => near(formatBytes(1_000_000, CSV_BYTES_PER_ROW) / 1_000_000, 23.27, 1e-9, "MB"),
  },
  {
    name: "so the csv is 9.6 times the bytes",
    run: () => near(timeRatio(1_000_000, 1_000_000), 9.615, 0.01, "ratio"),
  },
  {
    name: "2.4 MB at a thousand megabytes a second is 2.4 ms",
    run: () => near(scanMs(formatBytes(1_000_000, PARQUET_BYTES_PER_ROW)), 2.42, 1e-9, "ms"),
  },
  {
    name: "ten million rows in parquet fit in 25 MB",
    run: () => near(formatBytes(10_000_000, PARQUET_BYTES_PER_ROW) / 1_000_000, 24.2, 1e-9, "MB"),
  },
  {
    name: "the same ten million in csv are 233 MB",
    run: () => near(formatBytes(10_000_000, CSV_BYTES_PER_ROW) / 1_000_000, 232.7, 1e-9, "MB"),
  },
  {
    name: "a sixteen millisecond budget buys 6.6 million parquet rows",
    run: () => eq(rowsInBudget(16, PARQUET_BYTES_PER_ROW), 6_611_570, "rows"),
  },
  {
    name: "and 687 thousand csv rows",
    run: () => eq(rowsInBudget(16, CSV_BYTES_PER_ROW), 687_580, "rows"),
  },
  {
    name: "a throughput of zero is refused instead of returning infinity",
    run: () => {
      const error = throws(() => scanMs(1_000, 0), "zero");
      return expect(error.message.includes("positive"), error.message);
    },
  },
  {
    name: "a negative row count is refused",
    run: () => {
      const error = throws(() => formatBytes(-1, PARQUET_BYTES_PER_ROW), "negative");
      return expect(error.message.includes("row count"), error.message);
    },
  },
];

export function main(): number {
  for (const [label, perRow] of [["parquet", PARQUET_BYTES_PER_ROW], ["csv", CSV_BYTES_PER_ROW]] as const) {
    const bytes = formatBytes(1_000_000, perRow);
    console.log(`${label.padEnd(8)} ${(bytes / 1_000_000).toFixed(1)} MB, ${scanMs(bytes).toFixed(1)} ms at ${THROUGHPUT_MBPS} MB/s`);
  }
  console.log("");
  console.log(`a 16 ms budget is ${rowsInBudget(16, PARQUET_BYTES_PER_ROW)} parquet rows or ${rowsInBudget(16, CSV_BYTES_PER_ROW)} csv rows`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
