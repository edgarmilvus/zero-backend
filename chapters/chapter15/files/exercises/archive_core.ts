/**
 * Exercise 5, file 1 of 3 - the pure part.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Note = { readonly id: string; readonly title: string; readonly body: string };

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalNotes(notes: readonly Note[]): string {
  return canonical([...notes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

export function emptyNotes(notes: readonly Note[]): boolean {
  return notes.length === 0;
}

export function requireNotes(notes: readonly Note[]): void {
  if (notes.length === 0) throw new Error("archive: at least one note is required");
  for (const [index, note] of notes.entries()) {
    if (note.id.trim() === "") throw new Error(`archive.notes[${index}]: missing id`);
    if (note.title.trim() === "") throw new Error(`archive.notes[${index}]: missing title`);
  }
}

export const checks: readonly Check[] = [
  { name: "canonical sorts keys", run: () => eq(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}', "keys") },
  { name: "canonical notes sort by id", run: () => eq(canonicalNotes([{ id: "b", title: "B", body: "" }, { id: "a", title: "A", body: "" }]).startsWith('[{"body":"","id":"a"'), true, "order") },
  { name: "an empty archive is not an archive", run: () => expect(emptyNotes([]), "empty") },
  { name: "a note without a title is refused", run: () => {
    const error = throws(() => requireNotes([{ id: "a", title: " ", body: "" }]), "title");
    return expect(error.message.includes("title"), error.message);
  } },
  { name: "a note without an id is refused", run: () => {
    const error = throws(() => requireNotes([{ id: "", title: "t", body: "" }]), "id");
    return expect(error.message.includes("id"), error.message);
  } },
];
