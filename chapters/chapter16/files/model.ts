/**
 * The capstone's model: notes, a last-writer-wins merge by timestamp, and a search that is a scan.
 *
 * No imports, no types the browser cannot strip, and no collection with an index: the whole state is
 * an array of notes and the whole merge is a per-id comparison.
 */

export type Note = {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  deleted?: boolean;
};

export type Doc = {
  v: 2;
  notes: Note[];
};

export function emptyDoc(): Doc {
  return { v: 2, notes: [] };
}

const id = (): string => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function addNote(doc: Doc, title: string, body: string, now = Date.now()): Doc {
  const trimmed = title.trim();
  if (trimmed === "") throw new Error("note: a title is required");
  const note: Note = { id: id(), title: trimmed, body, updatedAt: now };
  return { v: doc.v, notes: [...doc.notes, note] };
}

export function editNote(doc: Doc, noteId: string, title: string, body: string, now = Date.now()): Doc {
  const found = doc.notes.some((note) => note.id === noteId);
  if (!found) throw new Error(`note ${noteId}: not in this document`);
  return {
    v: doc.v,
    notes: doc.notes.map((note) =>
      note.id === noteId ? { ...note, title: title.trim() || note.title, body, updatedAt: now } : note,
    ),
  };
}

/** A tombstone, because an import from another device would resurrect a removed note otherwise. */
export function deleteNote(doc: Doc, noteId: string, now = Date.now()): Doc {
  const found = doc.notes.some((note) => note.id === noteId);
  if (!found) throw new Error(`note ${noteId}: not in this document`);
  return {
    v: doc.v,
    notes: doc.notes.map((note) => (note.id === noteId ? { ...note, deleted: true, updatedAt: now } : note)),
  };
}

export function live(doc: Doc): Note[] {
  return doc.notes.filter((note) => !note.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Keyword search over title and body, which is the floppy-sized search. */
export function search(doc: Doc, term: string): Note[] {
  const needle = term.trim().toLowerCase();
  if (needle === "") return live(doc);
  return live(doc).filter((note) => `${note.title}\n${note.body}`.toLowerCase().includes(needle));
}

/**
 * The merge: per id, the later updatedAt wins; a tombstone is a value like any other.
 *
 * Not a CRDT with vector clocks, and the chapter says why: two devices that edit the same note while
 * apart lose one edit, and the timestamp is the only ordering there is.
 */
export function mergeDocs(local: Doc, incoming: Doc): { doc: Doc; added: number; conflicts: number } {
  const byId = new Map<string, Note>();
  for (const note of local.notes) byId.set(note.id, note);
  let added = 0;
  let conflicts = 0;

  for (const note of incoming.notes) {
    const mine = byId.get(note.id);
    if (!mine) {
      byId.set(note.id, note);
      added += 1;
      continue;
    }
    if (note.updatedAt > mine.updatedAt) {
      byId.set(note.id, note);
      conflicts += 1;
    } else if (note.updatedAt < mine.updatedAt) {
      conflicts += 1;
    }
  }

  return { doc: { v: 2, notes: [...byId.values()] }, added, conflicts };
}
