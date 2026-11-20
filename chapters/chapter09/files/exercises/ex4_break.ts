/**
 * Exercise 4 - the migration that runs twice.
 *
 * A migration applied outside a transaction, retried after a failed page load, creates a table that
 * already exists and a version table that lies about which shape the database has.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Db = {
  readonly tables: readonly string[];
  readonly version: number;
  readonly inTransaction: boolean;
};

export const EMPTY: Db = { tables: [], version: 0, inTransaction: false };

/** The bug: each statement applied as it comes, and the version written afterwards. */
export function applyUntransactional(db: Db, statements: readonly string[], version: number, failAfter: number): Db {
  let tables = [...db.tables];
  for (const [index, statement] of statements.entries()) {
    if (index === failAfter) throw new Error(`statement ${index} failed`);
    if (tables.includes(statement) && statement.startsWith("create")) {
      throw new Error(`table already exists: ${statement}`);
    }
    if (statement.startsWith("create")) tables = [...tables, statement];
  }
  return { tables, version, inTransaction: false };
}

/** The repair: the batch commits or it does not, and the version moves with the tables. */
export function applyTransactional(db: Db, statements: readonly string[], version: number, failAfter: number): Db {
  let tables = [...db.tables];
  try {
    for (const [index, statement] of statements.entries()) {
      if (index === failAfter) throw new Error(`statement ${index} failed`);
      if (statement.startsWith("create")) tables = [...tables, statement];
    }
  } catch {
    return db;
  }
  return { tables, version, inTransaction: true };
}

const STATEMENTS = ["create docs", "alter docs", "create index docs_idx"];

export const checks: readonly Check[] = [
  {
    name: "an untransactional migration leaves the table it created",
    run: () => {
      try {
        applyUntransactional(EMPTY, STATEMENTS, 1, 1);
        return false;
      } catch {
        return true;
      }
    },
  },
  {
    name: "so the retry finds the table already there",
    run: () => {
      // What the failed attempt left behind, as a database.
      const after = { tables: ["create docs"], version: 0, inTransaction: false };
      return eq(after.tables.length, 1, "left behind");
    },
  },
  {
    name: "and the version never moved, so the retry tries again",
    run: () => {
      const after = { tables: ["create docs"], version: 0, inTransaction: false };
      const error = (() => {
        try {
          applyUntransactional(after, STATEMENTS, 1, 9);
          return null;
        } catch (caught) {
          return caught as Error;
        }
      })();
      return expect(error?.message.includes("already exists") === true, String(error?.message));
    },
  },
  {
    name: "a transactional migration leaves nothing",
    run: () => eq(applyTransactional(EMPTY, STATEMENTS, 1, 1), EMPTY, "database"),
  },
  {
    name: "and the retry succeeds",
    run: () => {
      const first = applyTransactional(EMPTY, STATEMENTS, 1, 1);
      const second = applyTransactional(first, STATEMENTS, 1, 9);
      return eq(second.version, 1, "version");
    },
  },
  {
    name: "a successful transaction moves the version with the tables",
    run: () => {
      const done = applyTransactional(EMPTY, STATEMENTS, 1, 9);
      // Two of the three statements create something: the table and its index.
      eq(done.tables.length, 2, "tables");
      return eq(done.version, 1, "version");
    },
  },
  {
    name: "the version and the tables cannot disagree after a commit",
    run: () => {
      const done = applyTransactional(EMPTY, STATEMENTS, 3, 9);
      return expect(done.version === 3 && done.tables.length === 2, "disagreement");
    },
  },
  {
    name: "a migration with no statements commits the version",
    run: () => eq(applyTransactional(EMPTY, [], 2, 9).version, 2, "version"),
  },
  {
    name: "the flag records that the batch was transactional",
    run: () => eq(applyTransactional(EMPTY, STATEMENTS, 1, 9).inTransaction, true, "flag"),
  },
];

export function main(): number {
  try {
    applyUntransactional(EMPTY, STATEMENTS, 1, 1);
  } catch (error) {
    console.log(`untransactional  ${(error as Error).message}, table left behind`);
  }
  console.log(`transactional    ${JSON.stringify(applyTransactional(EMPTY, STATEMENTS, 1, 1))}`);
  console.log("");
  console.log("a retry is only safe when the failed attempt left nothing");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
