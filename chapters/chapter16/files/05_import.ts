/**
 * Example 5 - the import, and the second import of the same file.
 *
 *   node chapters/chapter16/files/05_import.ts
 *
 * A file imported twice must not double the notebook: the merge is per id and the timestamps are
 * equal, so the second import adds nothing. A file with a newer note updates it.
 */

import { addNote, emptyDoc, live, mergeDocs } from "./model.ts";

export function main(): number {
  let a = emptyDoc();
  a = addNote(a, "Shared", "written on the laptop", 1_000);
  a = addNote(a, "Second", "only on the laptop", 2_000);

  const file = { v: 2 as const, notes: a.notes };

  const first = mergeDocs(emptyDoc(), file);
  const twice = mergeDocs(first.doc, file);

  let newer = emptyDoc();
  newer = mergeDocs(newer, file).doc;
  newer = { v: 2, notes: newer.notes.map((note) => (note.id === a.notes[0]!.id ? { ...note, body: "edited later", updatedAt: 9_000 } : note)) };
  const updated = mergeDocs(newer, file);

  console.log(`first import      ${first.added} added`);
  console.log(`second import     ${twice.added} added, ${twice.conflicts} conflict(s)`);
  console.log(`older file        does not overwrite: ${live(updated.doc).find((note) => note.id === a.notes[0]!.id)?.body === "edited later"}`);
  console.log("");
  console.log("an import is a merge, and a merge is idempotent");

  return first.added === 2 && twice.added === 0 && updated.added === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
