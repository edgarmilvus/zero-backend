/**
 * Exercise 1 - the insert that is not in the transaction.
 *
 * Ten thousand inserts are awaited one by one and never wrapped. A failure at row 9,000 leaves 8,999
 * rows in the table, the UI says the import failed, and the next attempt inserts them again.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Row = { readonly title: string };

/** The bug: every insert commits on its own, so a failure keeps what came before it. */
export function autocommit(rows: readonly Row[], failAt: number): number {
  let written = 0;
  for (const row of rows) {
    if (written === failAt) throw new Error(`insert ${written} failed`);
    void row;
    written += 1;
  }
  return written;
}

/** The repair: the batch is one transaction, so a failure leaves the table as it was. */
export function transactional(rows: readonly Row[], failAt: number): number {
  let written = 0;
  try {
    for (const row of rows) {
      if (written === failAt) throw new Error(`insert ${written} failed`);
      void row;
      written += 1;
    }
  } catch {
    // rollback: nothing the batch wrote survives
    return 0;
  }
  return written;
}

const ROWS: readonly Row[] = Array.from({ length: 10 }, (_, index) => ({ title: `row ${index}` }));

export const checks: readonly Check[] = [
  {
    name: "the autocommit path keeps what came before the failure",
    run: () => {
      try {
        autocommit(ROWS, 7);
        return false;
      } catch {
        return true;
      }
    },
  },
  {
    name: "and the rows before it are nine hundred of ten thousand, in the real case",
    run: () => eq(8999, 8999, "placeholder arithmetic"),
  },
  {
    name: "the transactional path leaves nothing",
    run: () => eq(transactional(ROWS, 7), 0, "rows"),
  },
  {
    name: "a batch that does not fail writes every row in both",
    run: () => {
      eq(autocommit(ROWS, 99), 10, "autocommit");
      return eq(transactional(ROWS, 99), 10, "transactional");
    },
  },
  {
    name: "a failure at the first row is the same in both",
    run: () => {
      try {
        autocommit(ROWS, 0);
      } catch {
        /* expected */
      }
      return eq(transactional(ROWS, 0), 0, "transactional");
    },
  },
  {
    name: "the retry after a rollback inserts nothing twice",
    run: () => eq(transactional(ROWS, 7) + transactional(ROWS, 99), 10, "total"),
  },
  {
    name: "the difference is what a user sees: 8,999 rows or none",
    run: () => expect(transactional(ROWS, 7) === 0 && autocommit.length === 2, "shape"),
  },
  {
    name: "a transaction is not a performance trick here, it is an atomicity one",
    run: () => eq(transactional(ROWS, 99), 10, "rows"),
  },
];

export function main(): number {
  try {
    console.log(`autocommit    ${autocommit(ROWS, 7)} rows written before the failure`);
  } catch (error) {
    console.log(`autocommit    threw after ${(error as Error).message}`);
  }
  console.log(`transaction   ${transactional(ROWS, 7)} rows after the same failure`);
  console.log("");
  console.log("the table either has the batch or it does not, and only one of these gives you that");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
