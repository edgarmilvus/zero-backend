/**
 * The store: one JSON string, a version, and a migration that refuses a future file.
 *
 * localStorage is the chapter's choice because the app is a file and the data has to survive a reload
 * without a database runtime; the interface is the same one IndexedDB would use.
 */

import { type Doc } from "./model.ts";

export const KEY = "zero-backend-capstone";

export function storageKey(): string {
  return KEY;
}

export function encodeDoc(doc: Doc): string {
  return JSON.stringify({ v: doc.v, notes: doc.notes });
}

export function decodeDoc(raw: string | null): Doc {
  if (raw === null || raw === "") return { v: 2, notes: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("store: not JSON; the saved document is corrupt");
  }
  return migrate(parsed);
}

/** v1 had `text` and no `updatedAt`; v2 is what the model uses. A v3 is refused. */
export function migrate(value: unknown): Doc {
  if (typeof value !== "object" || value === null) throw new Error("store: expected a document");
  const root = value as { v?: unknown; notes?: unknown };

  if (root.v === 2) return { v: 2, notes: readNotes(root.notes) };
  if (root.v === 1) {
    const old = readNotes(root.notes, true);
    return { v: 2, notes: old.map((note, index) => ({ ...note, updatedAt: index + 1 })) };
  }
  throw new Error(`store: version ${String(root.v)} is newer than this build; refusing to read it`);
}

function readNotes(value: unknown, legacy = false): Doc["notes"] {
  if (!Array.isArray(value)) throw new Error("store.notes: expected an array");
  return value.map((entry, index) => {
    const note = entry as Record<string, unknown>;
    if (typeof note.id !== "string") throw new Error(`store.notes[${index}]: missing id`);
    const title = typeof note.title === "string" ? note.title : typeof note.text === "string" ? note.text.slice(0, 40) : "";
    const body = typeof note.body === "string" ? note.body : typeof note.text === "string" ? note.text : "";
    const updatedAt = typeof note.updatedAt === "number" ? note.updatedAt : index + 1;
    if (legacy && title === "") throw new Error(`store.notes[${index}]: a v1 note has no text`);
    return {
      id: note.id,
      title,
      body,
      updatedAt,
      ...(note.deleted === true ? { deleted: true } : {}),
    };
  });
}
