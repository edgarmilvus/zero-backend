/**
 * Exercise 2 - the chapter with no evidence.
 *
 * A ledger that checks only the claims it has cannot notice a chapter that is missing. Coverage is the
 * other half: the set of chapters the book promised, minus the set it can prove.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Claim = { readonly chapter: number; readonly evidence: string };

export function missing(claims: readonly Claim[], chapters: number): number[] {
  if (!Number.isInteger(chapters) || chapters < 1) throw new Error(`chapters: ${chapters} is not a count`);
  const present = new Set(claims.map((claim) => claim.chapter));
  const out: number[] = [];
  for (let chapter = 1; chapter <= chapters; chapter += 1) if (!present.has(chapter)) out.push(chapter);
  return out;
}

const CLAIMS: readonly Claim[] = [
  { chapter: 1, evidence: "a" },
  { chapter: 2, evidence: "b" },
  { chapter: 4, evidence: "d" },
];

export const checks: readonly Check[] = [
  { name: "a full set has no gap", run: () => eq(missing([{ chapter: 1, evidence: "a" }], 1).length, 0, "missing") },
  { name: "a gap is reported by number", run: () => eq(missing(CLAIMS, 4).join(","), "3", "missing") },
  { name: "two gaps are both reported", run: () => eq(missing([{ chapter: 1, evidence: "a" }], 4).join(","), "2,3,4", "missing") },
  { name: "an empty ledger misses every chapter", run: () => eq(missing([], 3).length, 3, "missing") },
  { name: "a chapter beyond the count is ignored", run: () => eq(missing([{ chapter: 5, evidence: "x" }], 3).length, 3, "missing") },
  { name: "a duplicate chapter does not fill two gaps", run: () => eq(missing([{ chapter: 1, evidence: "a" }, { chapter: 1, evidence: "b" }], 3).join(","), "2,3", "missing") },
  { name: "zero chapters is refused", run: () => {
    const error = throws(() => missing([], 0), "zero");
    return expect(error.message.includes("count"), error.message);
  } },
  { name: "the missing list is ordered", run: () => eq(missing([], 5).join(","), "1,2,3,4,5", "order") },
  { name: "a claim for every chapter leaves nothing", run: () => eq(missing([1, 2, 3].map((chapter) => ({ chapter, evidence: "x" })), 3).length, 0, "missing") },
];

export function main(): number {
  console.log(`gaps              ${missing(CLAIMS, 4).join(",")}`);
  console.log("");
  console.log("the chapters the book promised minus the chapters it can prove");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
