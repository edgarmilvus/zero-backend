/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * MEMFS as a table: a name, a byte count, a total. No bytes, no wasm, no worker, which is what
 * lets the capstone's ledger arithmetic be tested before anything downloads.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Table = {
  readonly budgetBytes: number;
  readonly files: Readonly<Record<string, number>>;
};

export function newTable(budgetBytes: number): Table {
  if (!Number.isFinite(budgetBytes) || budgetBytes < 0) {
    throw new Error(`budget: expected a non-negative number, got ${budgetBytes}`);
  }
  return { budgetBytes, files: {} };
}

/** Adds or replaces a file, refusing a write that would pass the budget. */
export function put(table: Table, name: string, bytes: number): Table {
  if (!name || name.includes("/")) throw new Error(`name: "${name}" must be a single segment`);
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error(`bytes: ${bytes} is not a size`);
  const next = (totalBytes(table) - (table.files[name] ?? 0)) + bytes;
  if (next > table.budgetBytes) {
    throw new Error(`quota: ${next} exceeds ${table.budgetBytes}`);
  }
  return { ...table, files: { ...table.files, [name]: bytes } };
}

export function sizeOf(table: Table, name: string): number {
  const size = table.files[name];
  if (size === undefined) throw new Error(`no such file: ${name}`);
  return size;
}

export function totalBytes(table: Table): number {
  return Object.values(table.files).reduce((sum, bytes) => sum + bytes, 0);
}

// --- the tests this file owns -------------------------------------------------

export const checks: readonly Check[] = [
  {
    name: "a new table is empty",
    run: () => eq(totalBytes(newTable(1000)), 0, "total"),
  },
  {
    name: "put returns a new table and leaves the old one alone",
    run: () => {
      const before = newTable(1000);
      const after = put(before, "a.mp4", 100);
      eq(Object.keys(before.files).length, 0, "original");
      return eq(sizeOf(after, "a.mp4"), 100, "copy");
    },
  },
  {
    name: "replacing a file does not double count",
    run: () => {
      const table = put(put(newTable(1000), "a.mp4", 600), "a.mp4", 600);
      return eq(totalBytes(table), 600, "total");
    },
  },
  {
    name: "a write past the budget is refused",
    run: () => {
      const error = throws(() => put(newTable(100), "a.mp4", 200), "budget");
      return expect(error.message.includes("exceeds"), error.message);
    },
  },
  {
    name: "a file that is not in the table throws by name",
    run: () => {
      const error = throws(() => sizeOf(newTable(100), "ghost.mp4"), "missing");
      return expect(error.message.includes("ghost.mp4"), error.message);
    },
  },
];
