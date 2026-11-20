/**
 * Exercise 1 - the cosine that forgot to divide.
 *
 * A dot product is a number that grows with the length of both vectors, so a search that ranks by it
 * ranks by length. The repair is one division, and the test that proves it is a document that is
 * simply longer than the right one.
 */

import { eq, expect, near, throws, type Check } from "./selfcheck.ts";

export type Vec = readonly number[];

export function dot(a: Vec, b: Vec): number {
  if (a.length !== b.length) throw new Error(`dot: ${a.length} and ${b.length} dimensions`);
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += (a[index] as number) * (b[index] as number);
  return sum;
}

export function norm(a: Vec): number {
  return Math.sqrt(dot(a, a));
}

/** The bug: a dot product, named as if it were a cosine. */
export function brokenScore(a: Vec, b: Vec): number {
  return dot(a, b);
}

/** The repair: divide by both lengths, which makes the score an angle and not a size. */
export function cosine(a: Vec, b: Vec): number {
  const denominator = norm(a) * norm(b);
  if (denominator === 0) return 0;
  return dot(a, b) / denominator;
}

export const QUERY: Vec = [1, 0, 0];
export const RIGHT: Vec = [1, 0, 0];
export const LONGER_BUT_WRONG: Vec = [8, 3, 0];

export const checks: readonly Check[] = [
  {
    name: "the broken score prefers the longer vector",
    run: () => expect(brokenScore(QUERY, LONGER_BUT_WRONG) > brokenScore(QUERY, RIGHT), "length won"),
  },
  {
    name: "the cosine prefers the one that points the same way",
    run: () => expect(cosine(QUERY, RIGHT) > cosine(QUERY, LONGER_BUT_WRONG), "angle lost"),
  },
  {
    name: "the cosine of identical vectors is one",
    run: () => near(cosine(RIGHT, RIGHT), 1, 1e-9, "identical"),
  },
  {
    name: "scaling a vector does not change its cosine",
    run: () => near(cosine(QUERY, [5, 0, 0]), 1, 1e-9, "scaled"),
  },
  {
    name: "orthogonal vectors score zero",
    run: () => near(cosine([1, 0, 0], [0, 1, 0]), 0, 1e-9, "orthogonal"),
  },
  {
    name: "a zero vector has no angle and scores zero",
    run: () => eq(cosine([0, 0, 0], QUERY), 0, "zero"),
  },
  {
    name: "mismatched dimensions are refused",
    run: () => {
      const error = throws(() => cosine([1, 2], [1, 2, 3]), "dims");
      return expect(error.message.includes("dimensions"), error.message);
    },
  },
  {
    name: "the two rankings disagree on the same three documents",
    run: () => {
      const documents = [RIGHT, LONGER_BUT_WRONG, [0.9, 0.1, 0]];
      const byBroken = documents.map((doc, at) => ({ at, score: brokenScore(QUERY, doc) })).sort((a, b) => b.score - a.score);
      const byCosine = documents.map((doc, at) => ({ at, score: cosine(QUERY, doc) })).sort((a, b) => b.score - a.score);
      return expect(byBroken[0]?.at !== byCosine[0]?.at, "the rankings agreed, so the fixture proves nothing");
    },
  },
];

export function main(): number {
  const documents = [RIGHT, LONGER_BUT_WRONG];
  for (const [label, score] of [["dot", brokenScore], ["cosine", cosine]] as const) {
    console.log(`${label.padEnd(7)} ${documents.map((doc) => score(QUERY, doc).toFixed(3)).join("  ")}`);
  }
  console.log("");
  console.log("a dot product ranks by length; a cosine ranks by direction");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
