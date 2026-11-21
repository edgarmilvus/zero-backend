/**
 * Exercise 3 - the store that could not be read back.
 *
 * A document version written and never checked is a migration that never happens: a v1 reader meets a
 * v2 file, parses it, and silently shows nothing.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Doc = { readonly v: number; readonly notes: readonly { id: string; title: string }[] };

export function migrate(value: unknown): Doc {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("store: expected a document");
  const root = value as { v?: unknown; notes?: unknown };

  if (typeof root.v !== "number") throw new Error("store: missing version");
  if (root.v > 2) throw new Error(`store: version ${root.v} is newer than this build`);
  if (!Array.isArray(root.notes)) throw new Error("store.notes: expected an array");

  const notes = root.notes.map((entry, index) => {
    const note = entry as { id?: unknown; title?: unknown; text?: unknown };
    if (typeof note.id !== "string") throw new Error(`store.notes[${index}]: missing id`);
    const title = typeof note.title === "string" ? note.title : typeof note.text === "string" ? note.text : "";
    return { id: note.id, title };
  });
  return { v: 2, notes };
}

export const checks: readonly Check[] = [
  { name: "a v2 document round trips", run: () => eq(migrate({ v: 2, notes: [{ id: "a", title: "A" }] }).notes.length, 1, "notes") },
  { name: "a v1 document is upgraded", run: () => eq(migrate({ v: 1, notes: [{ id: "a", text: "old" }] }).v, 2, "version") },
  { name: "a v1 title comes from text", run: () => eq(migrate({ v: 1, notes: [{ id: "a", text: "old" }] }).notes[0]?.title, "old", "title") },
  { name: "a v3 document is refused", run: () => {
    const error = throws(() => migrate({ v: 3, notes: [] }), "future");
    return expect(error.message.includes("newer"), error.message);
  } },
  { name: "a missing version is refused", run: () => {
    const error = throws(() => migrate({ notes: [] }), "version");
    return expect(error.message.includes("missing"), error.message);
  } },
  { name: "a missing notes array is refused", run: () => {
    const error = throws(() => migrate({ v: 2 }), "notes");
    return expect(error.message.includes("expected an array"), error.message);
  } },
  { name: "a note without an id is refused", run: () => {
    const error = throws(() => migrate({ v: 2, notes: [{}] }), "id");
    return expect(error.message.includes("missing id"), error.message);
  } },
  { name: "an array is not a document", run: () => {
    const error = throws(() => migrate([]), "array");
    return expect(error.message.includes("document"), error.message);
  } },
  { name: "a null is not a document", run: () => {
    const error = throws(() => migrate(null), "null");
    return expect(error.message.includes("document"), error.message);
  } },
  { name: "the migration is idempotent", run: () => {
    const once = migrate({ v: 1, notes: [{ id: "a", text: "old" }] });
    return eq(migrate(once).notes[0]?.title, "old", "title");
  } },
];

export function main(): number {
  console.log(`v1 -> v2          ${JSON.stringify(migrate({ v: 1, notes: [{ id: "a", text: "old" }] }))}`);
  console.log("");
  console.log("a version that is written and never read is a comment");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
