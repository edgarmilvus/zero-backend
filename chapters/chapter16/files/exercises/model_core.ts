/**
 * Exercise 5, file 1 of 3 - the pure part.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Note = { readonly id: string; readonly title: string; readonly body: string; readonly updatedAt: number; readonly deleted?: boolean };

export function live(notes: readonly Note[]): Note[] {
  return notes.filter((note) => !note.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function search(notes: readonly Note[], term: string): Note[] {
  const needle = term.trim().toLowerCase();
  if (needle === "") return live(notes);
  return live(notes).filter((note) => `${note.title}\n${note.body}`.toLowerCase().includes(needle));
}

export function merge(local: readonly Note[], incoming: readonly Note[]): { notes: Note[]; added: number } {
  const byId = new Map(local.map((note) => [note.id, note]));
  let added = 0;
  for (const note of incoming) {
    const mine = byId.get(note.id);
    if (!mine) {
      byId.set(note.id, note);
      added += 1;
    } else if (note.updatedAt > mine.updatedAt) {
      byId.set(note.id, note);
    }
  }
  return { notes: [...byId.values()], added };
}

export function requireTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === "") throw new Error("note: a title is required");
  return trimmed;
}

const A: Note = { id: "a", title: "First", body: "milk", updatedAt: 100 };
const B: Note = { id: "b", title: "Second", body: "bread", updatedAt: 200 };

export const checks: readonly Check[] = [
  { name: "live sorts newest first", run: () => eq(live([A, B])[0]?.id, "b", "order") },
  { name: "a deleted note is not live", run: () => eq(live([{ ...A, deleted: true }, B]).length, 1, "live") },
  { name: "search matches a body", run: () => eq(search([A, B], "bread").length, 1, "hits") },
  { name: "an empty search returns everything live", run: () => eq(search([A, B], " ").length, 2, "hits") },
  { name: "merge adds a new id and replaces a newer one", run: () => {
    eq(merge([A], [B]).added, 1, "added");
    return eq(merge([A], [{ ...A, title: "new", updatedAt: 300 }]).notes[0]?.title, "new", "replace");
  } },
];
