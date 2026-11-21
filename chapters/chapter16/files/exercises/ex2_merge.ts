/**
 * Exercise 2 - the import that duplicated every note.
 *
 * An import that appends by id keeps both copies, and importing the same file twice doubles the
 * notebook. The merge is per id and by timestamp, and a second import adds nothing.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Note = { readonly id: string; readonly title: string; readonly updatedAt: number };
export type Doc = { readonly notes: readonly Note[] };

/** The bug: concatenate and deduplicate nothing. */
export function append(notes: readonly Note[], incoming: readonly Note[]): Note[] {
  return [...notes, ...incoming];
}

/** The repair: per id, the later timestamp wins. */
export function merge(notes: readonly Note[], incoming: readonly Note[]): { notes: Note[]; added: number; conflicts: number } {
  const byId = new Map<string, Note>();
  for (const note of notes) byId.set(note.id, note);
  let added = 0;
  let conflicts = 0;
  for (const note of incoming) {
    const mine = byId.get(note.id);
    if (!mine) {
      byId.set(note.id, note);
      added += 1;
    } else if (note.updatedAt > mine.updatedAt) {
      byId.set(note.id, note);
      conflicts += 1;
    } else if (note.updatedAt < mine.updatedAt) {
      conflicts += 1;
    }
  }
  return { notes: [...byId.values()], added, conflicts };
}

const A: Note = { id: "a", title: "First", updatedAt: 100 };
const B: Note = { id: "b", title: "Second", updatedAt: 200 };

export const checks: readonly Check[] = [
  { name: "appending the same file twice doubles it", run: () => eq(append(append([], [A, B]), [A, B]).length, 4, "notes") },
  { name: "merging twice does not", run: () => eq(merge(merge([], [A, B]).notes, [A, B]).notes.length, 2, "notes") },
  { name: "a first merge counts both as added", run: () => eq(merge([], [A, B]).added, 2, "added") },
  { name: "a second merge adds nothing", run: () => eq(merge([A, B], [A, B]).added, 0, "added") },
  { name: "a newer note replaces", run: () => eq(merge([A], [{ ...A, title: "new", updatedAt: 300 }]).notes[0]?.title, "new", "title") },
  { name: "an older note does not", run: () => eq(merge([{ ...A, updatedAt: 300 }], [A]).notes[0]?.title, "First", "title") },
  { name: "an older note is counted as a conflict", run: () => eq(merge([{ ...A, updatedAt: 300 }], [A]).conflicts, 1, "conflicts") },
  { name: "a merge keeps the ids unique", run: () => {
    const ids = merge([A, B], [A]).notes.map((note) => note.id);
    return eq(new Set(ids).size, ids.length, "unique");
  } },
  { name: "an empty import changes nothing", run: () => eq(merge([A], []).notes.length, 1, "notes") },
];

export function main(): number {
  const twice = append(append([], [A, B]), [A, B]).length;
  const merged = merge(merge([], [A, B]).notes, [A, B]).notes.length;
  console.log(`append twice      ${twice} notes`);
  console.log(`merge twice       ${merged} notes`);
  console.log("");
  console.log("an import is a merge, and a merge is idempotent");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
