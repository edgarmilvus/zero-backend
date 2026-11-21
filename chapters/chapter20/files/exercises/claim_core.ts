/**
 * Exercise 5, file 1 of 3 - the pure part.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Claim = { readonly id: string; readonly chapter: number; readonly evidence: string };

export function check(claims: readonly Claim[]): { ids: string[]; chapters: number[] } {
  const ids = new Set<string>();
  for (const claim of claims) {
    if (claim.id.trim() === "") throw new Error("claim: an id is required");
    if (ids.has(claim.id)) throw new Error(`claim: duplicate id ${claim.id}`);
    ids.add(claim.id);
    if (!Number.isInteger(claim.chapter) || claim.chapter < 1) throw new Error(`claim ${claim.id}: chapter is not a number`);
    if (claim.evidence.startsWith("/")) throw new Error(`claim ${claim.id}: evidence is absolute`);
  }
  return { ids: [...ids], chapters: claims.map((claim) => claim.chapter) };
}

export function gaps(chapters: readonly number[], total: number): number[] {
  if (!Number.isInteger(total) || total < 1) throw new Error(`total: ${total} is not a count`);
  const present = new Set(chapters);
  return Array.from({ length: total }, (_unused, index) => index + 1).filter((chapter) => !present.has(chapter));
}

export const checks: readonly Check[] = [
  { name: "a clean set returns its ids", run: () => eq(check([{ id: "c1", chapter: 1, evidence: "a" }]).ids.join(","), "c1", "ids") },
  { name: "a duplicate id is refused", run: () => {
    const error = throws(() => check([{ id: "c1", chapter: 1, evidence: "a" }, { id: "c1", chapter: 2, evidence: "b" }]), "duplicate");
    return expect(error.message.includes("duplicate"), error.message);
  } },
  { name: "an absolute evidence path is refused", run: () => {
    const error = throws(() => check([{ id: "c1", chapter: 1, evidence: "/etc/passwd" }]), "absolute");
    return expect(error.message.includes("absolute"), error.message);
  } },
  { name: "a zero chapter is refused", run: () => {
    const error = throws(() => check([{ id: "c1", chapter: 0, evidence: "a" }]), "zero");
    return expect(error.message.includes("not a number"), error.message);
  } },
  { name: "gaps lists the missing chapters", run: () => eq(gaps([1, 3], 4).join(","), "2,4", "gaps") },
];
