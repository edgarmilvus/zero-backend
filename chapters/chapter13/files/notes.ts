/**
 * The document: notes by id, each one an entry with a version and a tombstone.
 *
 * Deleting a note is writing a value that says it is gone. Removing the key instead would be free and
 * wrong: the next merge from a device that still has the note would put it back, because absence is
 * not a fact the merge can compare against anything.
 */

import { compare, version, type Version } from "./version.ts";

export type Note = {
  readonly title: string;
  readonly body: string;
};

export type Entry = {
  readonly version: Version;
  readonly note: Note | null;
};

export type Notes = ReadonlyMap<string, Entry>;

export function emptyNotes(): Notes {
  return new Map();
}

function requireId(id: string): string {
  const trimmed = id.trim();
  if (trimmed === "") throw new Error("note: an id is required");
  return trimmed;
}

/** A local write: the note, with a version this device has not used yet. */
export function write(notes: Notes, id: string, note: Note, at: Version): Notes {
  const key = requireId(id);
  if (note.title.trim() === "") throw new Error(`note ${key}: a title is required`);
  const next = new Map(notes);
  next.set(key, { version: at, note: { title: note.title, body: note.body } });
  return next;
}

/** A local delete: a tombstone with a version, which is a write like any other. */
export function remove(notes: Notes, id: string, at: Version): Notes {
  const key = requireId(id);
  if (!notes.has(key)) throw new Error(`note ${key}: not in this replica`);
  const next = new Map(notes);
  next.set(key, { version: at, note: null });
  return next;
}

/** The notes a reader sees: the entries that are not tombstones, in a stable order. */
export function read(notes: Notes): { id: string; title: string; body: string }[] {
  return [...notes.entries()]
    .filter((entry): entry is [string, Entry & { note: Note }] => entry[1].note !== null)
    .map(([id, entry]) => ({ id, title: entry.note.title, body: entry.note.body }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function tombstone(notes: Notes, id: string): boolean {
  const entry = notes.get(id);
  return entry !== undefined && entry.note === null;
}

/** The highest version in the document, which is where the local clock continues from. */
export function topVersion(notes: Notes): Version | undefined {
  return [...notes.values()].reduce<Version | undefined>(
    (best, entry) => (best === undefined || compare(entry.version, best) > 0 ? entry.version : best),
    undefined,
  );
}

/** A version for the next local write: above everything the replica has seen. */
export function nextVersion(notes: Notes, name: string): Version {
  return version((topVersion(notes)?.counter ?? 0) + 1, name);
}
