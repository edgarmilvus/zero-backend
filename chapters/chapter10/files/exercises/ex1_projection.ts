/**
 * Exercise 1 - the query that reads every column.
 *
 * `select *` over a million rows reads five columns to answer a question about two. A columnar file
 * makes that cost arithmetic: bytes read is the sum of the widths of the columns named, so a
 * projection is measured before it is written.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

/** Uncompressed logical width of each column, in bytes. */
export const WIDTHS: Readonly<Record<string, number>> = {
  id: 8,
  user_id: 4,
  kind: 4,
  day: 4,
  amount: 8,
};

export const COLUMNS = Object.keys(WIDTHS);

/** The columns a query needs. Duplicates are harmless; unknown names are not. */
export function project(asked: readonly string[]): string[] {
  if (asked.length === 0) throw new Error("projection: at least one column is needed");
  const seen = new Set<string>();
  for (const column of asked) {
    if (!(column in WIDTHS)) {
      throw new Error(`projection: unknown column ${column}; the file has ${COLUMNS.join(", ")}`);
    }
    seen.add(column);
  }
  return [...seen];
}

export function scanBytes(columns: readonly string[], rows: number): number {
  if (!Number.isInteger(rows) || rows < 0) throw new Error(`rows: ${rows} is not a row count`);
  let width = 0;
  for (const column of columns) {
    const w = WIDTHS[column];
    if (w === undefined) throw new Error(`scanBytes: unknown column ${column}`);
    width += w;
  }
  return width * rows;
}

/** The share of a `select *` scan that the projection does not need. */
export function wastedShare(asked: readonly string[]): number {
  const all = scanBytes(COLUMNS, 1);
  const used = scanBytes(project(asked), 1);
  return (all - used) / all;
}

export const checks: readonly Check[] = [
  {
    name: "all five columns at a million rows are 28 MB",
    run: () => eq(scanBytes(COLUMNS, 1_000_000), 28_000_000, "bytes"),
  },
  {
    name: "kind and amount are 12 MB",
    run: () => eq(scanBytes(project(["kind", "amount"]), 1_000_000), 12_000_000, "bytes"),
  },
  {
    name: "the projection saves 16 MB",
    run: () =>
      eq(scanBytes(COLUMNS, 1_000_000) - scanBytes(project(["kind", "amount"]), 1_000_000), 16_000_000, "saved"),
  },
  {
    name: "and leaves 57 per cent of the scan unread",
    run: () => eq(Math.round(wastedShare(["kind", "amount"]) * 100), 57, "share"),
  },
  {
    name: "an unknown column is refused with the list of real ones",
    run: () => {
      const error = throws(() => project(["kind", "note"]), "unknown");
      return expect(error.message.includes("id, user_id, kind"), error.message);
    },
  },
  {
    name: "a repeated column is read once",
    run: () => eq(project(["kind", "kind", "amount"]).join(","), "kind,amount", "columns"),
  },
  {
    name: "an empty projection is refused",
    run: () => {
      const error = throws(() => project([]), "empty");
      return expect(error.message.includes("at least one"), error.message);
    },
  },
  {
    name: "projecting every column costs what select * costs",
    run: () => eq(scanBytes(project(COLUMNS), 1000), scanBytes(COLUMNS, 1000), "bytes"),
  },
];

export function main(): number {
  for (const [label, asked] of [["select *", COLUMNS], ["projection", ["kind", "amount"]]] as const) {
    const bytes = scanBytes(asked, 1_000_000);
    console.log(`${label.padEnd(11)} ${(bytes / 1_000_000).toFixed(0)} MB  ${asked.join(", ")}`);
  }
  console.log("");
  console.log(`the projection leaves ${(wastedShare(["kind", "amount"]) * 100).toFixed(0)} per cent of the bytes unread`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
