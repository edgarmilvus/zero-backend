/**
 * Exercise 2 - the digest over a different order.
 *
 * A digest over `JSON.stringify(notes)` changes when the array is reordered, so two exports of the same
 * notes disagree and a file made from a reordered list is refused by its own reader.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Note = { readonly id: string; readonly title: string; readonly body: string };

/** The bug: JSON as it comes, order included. */
export function naiveText(notes: readonly Note[]): string {
  return JSON.stringify(notes);
}

/** The repair: sort the notes by id and the keys by name, drop undefined, no whitespace. */
export function canonicalText(notes: readonly Note[]): string {
  const sorted = [...notes].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return canonical(sorted);
}

/** A toy digest: the point is the input, not the hash. */
export function digest(text: string): number {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

const A: Note[] = [
  { id: "b", title: "Second", body: "body" },
  { id: "a", title: "First", body: "body" },
];

export const checks: readonly Check[] = [
  { name: "the naive text depends on order", run: () => expect(naiveText(A) !== naiveText([...A].reverse()), "same text") },
  { name: "the canonical text does not", run: () => eq(canonicalText(A), canonicalText([...A].reverse()), "text") },
  { name: "the canonical text sorts by id", run: () => expect(canonicalText(A).startsWith('[{"body":'), "id order") },
  { name: "the canonical text sorts keys", run: () => eq(canonicalText([{ id: "a", title: "t", body: "b" }]), '[{"body":"b","id":"a","title":"t"}]', "keys") },
  { name: "the digests differ when the naive text does", run: () => expect(digest(naiveText(A)) !== digest(naiveText([...A].reverse())), "same digest") },
  { name: "and agree when the canonical text does", run: () => eq(digest(canonicalText(A)), digest(canonicalText([...A].reverse())), "digest") },
  { name: "a changed body changes the canonical digest", run: () => {
    const edited = A.map((note) => (note.id === "a" ? { ...note, body: "other" } : note));
    return expect(digest(canonicalText(edited)) !== digest(canonicalText(A)), "same digest");
  } },
  { name: "undefined fields are dropped", run: () => eq(canonicalText([{ id: "a", title: "t", body: undefined as unknown as string }]), '[{"id":"a","title":"t"}]', "undefined") },
  { name: "an empty list is one canonical text", run: () => eq(canonicalText([]), "[]", "empty") },
];

export function main(): number {
  console.log(`naive             ${naiveText(A).slice(0, 40)}`);
  console.log(`reversed          ${naiveText([...A].reverse()).slice(0, 40)}`);
  console.log(`canonical         ${canonicalText(A).slice(0, 40)}`);
  console.log("");
  console.log("a digest is over bytes, and the bytes must not depend on which order the notes arrived");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
