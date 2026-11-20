/**
 * Exercise 2 - top ten, with a tie that breaks the limit.
 *
 * A top-k is an ordering and a cut, and the two are easy to separate by accident. `ORDER BY n DESC
 * LIMIT 10` on a table where the tenth and eleventh rows tie returns ten rows and hides the tie; a
 * top-k that keeps every row at the boundary returns eleven and is honest about it.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Scored = { readonly id: number; readonly score: number };

/**
 * The strict top-k: at most `k` rows, ordered by score descending and then by id ascending.
 *
 * The id tiebreak is not decoration. Without it, two rows with the same score come back in whatever
 * order the engine happened to produce, which changes between runs and between machines.
 */
export function topK(rows: readonly Scored[], k: number): Scored[] {
  if (!Number.isInteger(k) || k < 0) throw new Error(`k: ${k} is not a non-negative integer`);
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.id - b.id);
  return sorted.slice(0, k);
}

/**
 * The inclusive top-k: every row whose score is at least the k-th score.
 *
 * This is what "show me the leaders" means when the boundary ties: eleven rows, all of them tied at
 * the cut, and the count is the answer to a question the strict version cannot answer.
 */
export function topKWithTies(rows: readonly Scored[], k: number): Scored[] {
  const strict = topK(rows, k);
  const cutoff = strict.at(-1)?.score;
  if (cutoff === undefined) return [];
  return topK(rows, rows.length).filter((row) => row.score >= cutoff);
}

export const ROWS: readonly Scored[] = [
  { id: 4, score: 90 },
  { id: 1, score: 80 },
  { id: 7, score: 80 },
  { id: 2, score: 70 },
  { id: 9, score: 70 },
  { id: 3, score: 70 },
  { id: 5, score: 60 },
];

export const checks: readonly Check[] = [
  {
    name: "the strict top three has three rows",
    run: () => eq(topK(ROWS, 3).length, 3, "rows"),
  },
  {
    name: "and is ordered by score",
    run: () => eq(topK(ROWS, 3).map((row) => row.score).join(","), "90,80,80", "scores"),
  },
  {
    name: "a tie is broken by the smaller id first",
    run: () => eq(topK(ROWS, 3).map((row) => row.id).join(","), "4,1,7", "ids"),
  },
  {
    name: "asking for more rows than there are returns them all",
    run: () => eq(topK(ROWS, 100).length, ROWS.length, "rows"),
  },
  {
    name: "a top zero is an empty list",
    run: () => eq(topK(ROWS, 0).length, 0, "rows"),
  },
  {
    name: "a negative k is refused",
    run: () => {
      const error = throws(() => topK(ROWS, -1), "negative");
      return expect(error.message.includes("non-negative"), error.message);
    },
  },
  {
    name: "the inclusive top four keeps the tie at the cut",
    run: () => eq(topKWithTies(ROWS, 4).length, 6, "rows"),
  },
  {
    name: "and its last score is the cutoff",
    run: () => {
      const rows = topKWithTies(ROWS, 4);
      return eq(rows.at(-1)?.score, 70, "cutoff");
    },
  },
  {
    name: "a top three with no ties is exactly three",
    run: () => {
      const noTies = [
        { id: 1, score: 50 },
        { id: 2, score: 40 },
        { id: 3, score: 30 },
        { id: 4, score: 20 },
      ];
      return eq(topKWithTies(noTies, 3).length, 3, "rows");
    },
  },
];

export function main(): number {
  console.log(`strict top 3      ${topK(ROWS, 3).map((row) => `${row.id}:${row.score}`).join(" ")}`);
  console.log(`inclusive top 3   ${topKWithTies(ROWS, 3).length} rows, cutoff ${topKWithTies(ROWS, 3).at(-1)?.score}`);
  console.log("");
  console.log("a limit hides a tie; a cutoff reports it");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
