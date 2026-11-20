/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * Normalising, ranking and precision, with no model and no file. These are the three operations an
 * index is made of, and every one of them is testable with a handful of numbers.
 */

import { eq, expect, near, throws, type Check } from "./selfcheck.ts";

export type Vec = Float32Array;

export function normalize(vector: Vec): Vec {
  let length = 0;
  for (const value of vector) length += value * value;
  length = Math.sqrt(length);
  if (length === 0) return new Float32Array(vector);
  return Float32Array.from(vector, (value) => value / length);
}

export function rank(ids: readonly string[], scores: readonly number[], k: number): { id: string; score: number }[] {
  if (ids.length !== scores.length) throw new Error(`rank: ${ids.length} ids and ${scores.length} scores`);
  if (!Number.isInteger(k) || k < 0) throw new Error(`rank: k ${k} is not a non-negative integer`);
  return ids
    .map((id, at) => ({ id, score: scores[at] as number }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, k);
}

/** The share of the first k that is in the relevant set; the metric the chapter reports. */
export function precisionAt(ranked: readonly { id: string }[], relevant: ReadonlySet<string>, k: number): number {
  if (k <= 0) throw new Error(`precision: k ${k} must be positive`);
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter((row) => relevant.has(row.id)).length / top.length;
}

export const checks: readonly Check[] = [
  {
    name: "normalising a vector gives it length one",
    run: () => {
      const unit = normalize(Float32Array.from([3, 4]));
      return near(Math.hypot(unit[0] as number, unit[1] as number), 1, 1e-6, "length");
    },
  },
  {
    name: "a zero vector stays zero instead of becoming NaN",
    run: () => eq(normalize(new Float32Array(4))[0], 0, "zero"),
  },
  {
    name: "ranking orders by score and cuts at k",
    run: () => eq(rank(["a", "b", "c"], [0.2, 0.9, 0.5], 2).map((row) => row.id).join(","), "b,c", "order"),
  },
  {
    name: "precision counts the relevant rows in the top k",
    run: () => eq(precisionAt(rank(["a", "b", "c", "d"], [1, 2, 3, 4], 4), new Set(["a", "c", "z"]), 2), 0.5, "precision"),
  },
  {
    name: "ids and scores of different lengths are refused",
    run: () => {
      const error = throws(() => rank(["a"], [1, 2], 1), "lengths");
      return expect(error.message.includes("scores"), error.message);
    },
  },
];
