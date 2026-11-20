/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * A ledger is a set of rows, one per path, and the only operations are add, find
 * and total. No clock, no filesystem, no tariff: give it two literals and it can
 * be tested in a millisecond. Everything that needs a file lives one file over.
 */

import type { CostRow } from "../ledger.ts";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Ledger = {
  readonly rows: readonly CostRow[];
};

export function newLedger(): Ledger {
  return { rows: [] };
}

/** Returns a new ledger. The one passed in is never touched. */
export function addPath(ledger: Ledger, row: CostRow): Ledger {
  return { rows: [...ledger.rows.filter((existing) => existing.path !== row.path), row] };
}

export function rowFor(ledger: Ledger, path: CostRow["path"]): CostRow {
  const row = ledger.rows.find((candidate) => candidate.path === path);
  if (!row) throw new Error(`no row for path "${path}"`);
  return row;
}

/** The two paths added together, which is what a spreadsheet does by accident. */
export function total(ledger: Ledger): number {
  return ledger.rows.reduce((sum, row) => sum + row.perThousandUsd, 0);
}

// --- the tests this file owns -------------------------------------------------
//
// Five checks, no filesystem, no clock, no tariff: a literal row in, a row out.

function literal(path: CostRow["path"], perThousandUsd: number): CostRow {
  return {
    path,
    perThousandUsd,
    latencyMs: 1000,
    bytesLeavingDevice: path === "server" ? 1000 : 0,
    loses: path === "server" ? "the bill" : "nothing measured yet",
    assumptions: ["literal"],
  };
}

export const checks: readonly Check[] = [
  {
    name: "a new ledger has no rows",
    run: () => eq(newLedger().rows.length, 0, "rows"),
  },
  {
    name: "adding a row returns a new ledger",
    run: () => {
      const before = newLedger();
      const after = addPath(before, literal("server", 10));
      eq(before.rows.length, 0, "original untouched");
      return eq(after.rows.length, 1, "copy has the row");
    },
  },
  {
    name: "a row is found by its path",
    run: () => eq(rowFor(addPath(newLedger(), literal("client", 0)), "client").perThousandUsd, 0, "row"),
  },
  {
    name: "asking for a missing path throws by name",
    run: () => {
      const error = throws(() => rowFor(newLedger(), "server"), "missing row");
      return expect(error.message.includes("server"), error.message);
    },
  },
  {
    name: "the total adds the paths, which is the mistake to avoid",
    run: () => {
      const ledger = addPath(addPath(newLedger(), literal("server", 10)), literal("client", 0));
      return eq(total(ledger), 10, "total");
    },
  },
];

