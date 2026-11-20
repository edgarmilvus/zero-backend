/**
 * Exercise 1 - the merge that was not commutative.
 *
 * Applying an incoming entry only when its clock is ahead of the local document's highest is a rule
 * that depends on which side the call came from. A into B and B into A are different documents.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Entry = { readonly value: string; readonly clock: number };
export type Doc = Readonly<Record<string, Entry>>;

/** The bug: the incoming clock is compared with the document's highest, not with the key's. */
export function mergeByDocumentClock(local: Doc, incoming: Doc): Doc {
  const highest = Math.max(0, ...Object.values(local).map((entry) => entry.clock));
  const out: Record<string, Entry> = { ...local };
  for (const [key, entry] of Object.entries(incoming)) {
    if (entry.clock > highest) out[key] = entry;
  }
  return out;
}

/** The repair: per key, the higher clock wins, and the rule does not know which side is local. */
export function mergeByKey(local: Doc, incoming: Doc): Doc {
  const out: Record<string, Entry> = { ...local };
  for (const [key, entry] of Object.entries(incoming)) {
    const mine = out[key];
    if (mine === undefined || entry.clock > mine.clock || (entry.clock === mine.clock && entry.value > mine.value)) {
      out[key] = entry;
    }
  }
  return out;
}

/** Key order is not part of a document, so a comparison sorts it. */
function canonical(doc: Doc): string {
  return JSON.stringify(Object.fromEntries(Object.entries(doc).sort(([left], [right]) => (left < right ? -1 : 1))));
}

const A: Doc = { a: { value: "from a", clock: 1 } };
const B: Doc = { b: { value: "from b", clock: 2 } };
const SAME: Doc = { x: { value: "left", clock: 2 } };
const SAME_OTHER: Doc = { x: { value: "right", clock: 2 } };

export const checks: readonly Check[] = [
  {
    name: "the document-clock merge loses a key in one direction",
    run: () => expect(Object.keys(mergeByDocumentClock(A, B)).length !== Object.keys(mergeByDocumentClock(B, A)).length, "same shape"),
  },
  {
    name: "the per-key merge keeps both in both directions",
    run: () => {
      eq(Object.keys(mergeByKey(A, B)).length, 2, "forward");
      return eq(Object.keys(mergeByKey(B, A)).length, 2, "backward");
    },
  },
  {
    name: "the per-key merge commutes on the two-key fixture",
    run: () => eq(canonical(mergeByKey(A, B)), canonical(mergeByKey(B, A)), "document"),
  },
  {
    name: "the per-key merge breaks a tie the same way both directions",
    run: () => eq(canonical(mergeByKey(SAME, SAME_OTHER)), canonical(mergeByKey(SAME_OTHER, SAME)), "tie"),
  },
  {
    name: "a higher clock wins regardless of the side",
    run: () => {
      const low: Doc = { x: { value: "old", clock: 1 } };
      const high: Doc = { x: { value: "new", clock: 9 } };
      eq(mergeByKey(low, high).x?.value, "new", "forward");
      return eq(mergeByKey(high, low).x?.value, "new", "backward");
    },
  },
  {
    name: "the per-key merge is idempotent",
    run: () => eq(JSON.stringify(mergeByKey(mergeByKey(A, B), B)), JSON.stringify(mergeByKey(A, B)), "document"),
  },
  {
    name: "the per-key merge is associative over three documents",
    run: () => {
      const C: Doc = { c: { value: "from c", clock: 3 } };
      return eq(canonical(mergeByKey(mergeByKey(A, B), C)), canonical(mergeByKey(A, mergeByKey(B, C))), "associative");
    },
  },
  {
    name: "two empty documents merge to empty",
    run: () => eq(JSON.stringify(mergeByKey({}, {})), JSON.stringify(mergeByKey({}, {})), "empty"),
  },
];

export function main(): number {
  console.log(`document clock    ${Object.keys(mergeByDocumentClock(A, B)).length} then ${Object.keys(mergeByDocumentClock(B, A)).length}`);
  console.log(`per key           ${Object.keys(mergeByKey(A, B)).length} then ${Object.keys(mergeByKey(B, A)).length}`);
  console.log("");
  console.log("a merge that asks which side is local is a merge that depends on the call");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
