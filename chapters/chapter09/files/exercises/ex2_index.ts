/**
 * Exercise 2 - the index that costs more than it saves.
 *
 * An index on a column with two values is a second copy of the table: the planner declines to use it
 * for a query that matches half the rows, and every write pays to maintain it.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Table = {
  readonly rows: number;
  readonly distinctValues: number;
};

/** How much of the table a value matches, on average. */
export function selectivity(table: Table): number {
  return 1 / table.distinctValues;
}

/**
 * The planner's rule of thumb: an index is used when the predicate is selective enough.
 *
 * Ten per cent is the number Postgres itself uses before a sequential scan looks cheaper, and it is
 * the one this exercise models.
 */
export const SELECTIVE_ENOUGH = 0.1;

export function plannerUsesIndex(table: Table): boolean {
  return selectivity(table) <= SELECTIVE_ENOUGH;
}

/** The maintenance cost of an index, in writes: one extra write per insert. */
export function writeCost(table: Table, indexed: boolean): number {
  return table.rows * (indexed ? 2 : 1);
}

export type Decision = "index" | "skip";

export function decide(table: Table, queryMatchesAll: boolean): Decision {
  if (queryMatchesAll) return "skip";
  return plannerUsesIndex(table) ? "index" : "skip";
}

const TAGS: Table = { rows: 10_000, distinctValues: 2 };
const TITLES: Table = { rows: 10_000, distinctValues: 9_000 };

export const checks: readonly Check[] = [
  {
    name: "a two-valued column matches half the table",
    run: () => eq(selectivity(TAGS), 0.5, "selectivity"),
  },
  {
    name: "a title column matches almost nothing",
    run: () => expect(selectivity(TITLES) < 0.001, "selectivity"),
  },
  {
    name: "the planner declines the two-valued index",
    run: () => eq(plannerUsesIndex(TAGS), false, "uses index"),
  },
  {
    name: "and uses the title index",
    run: () => eq(plannerUsesIndex(TITLES), true, "uses index"),
  },
  {
    name: "the two-valued index doubles the write cost",
    run: () => eq(writeCost(TAGS, true) / writeCost(TAGS, false), 2, "ratio"),
  },
  {
    name: "so the decision is to skip it",
    run: () => eq(decide(TAGS, false), "skip", "decision"),
  },
  {
    name: "and to keep the title index",
    run: () => eq(decide(TITLES, false), "index", "decision"),
  },
  {
    name: "a query that matches everything skips even a selective index",
    run: () => eq(decide(TITLES, true), "skip", "decision"),
  },
  {
    name: "the threshold is the planner's, not the author's taste",
    run: () => eq(SELECTIVE_ENOUGH, 0.1, "threshold"),
  },
];

export function main(): number {
  for (const [label, table] of [["tags", TAGS], ["titles", TITLES]] as const) {
    console.log(
      `${label.padEnd(8)} ${table.distinctValues} values, matches ${(selectivity(table) * 100).toFixed(1)}%, ` +
        `planner ${plannerUsesIndex(table) ? "uses" : "declines"} the index`,
    );
  }
  console.log("");
  console.log("an index is a bet that the predicate is selective, and a two-valued column loses it");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
