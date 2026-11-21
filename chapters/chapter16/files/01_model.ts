/**
 * Example 1 - the model: add, search, delete, merge.
 *
 *   node chapters/chapter16/files/01_model.ts
 *
 * Two documents edited while apart, then merged by id and timestamp. The deleted note comes back as a
 * tombstone and stays deleted, which is the chapter 13 rule in ten lines.
 */

import { addNote, deleteNote, emptyDoc, live, mergeDocs, search } from "./model.ts";
import { renderDoc } from "./report.ts";

export function main(): number {
  let laptop = emptyDoc();
  laptop = addNote(laptop, "Groceries", "milk, eggs, bread", 1_000);
  laptop = addNote(laptop, "Merging", "one device at a time", 2_000);
  laptop = deleteNote(laptop, laptop.notes[1]!.id, 3_000);

  let phone = emptyDoc();
  phone = addNote(phone, "Offline", "the network is optional", 1_500);

  const merged = mergeDocs(laptop, phone);
  const found = search(merged.doc, "milk");

  console.log(renderDoc(merged.doc));
  console.log(`added             ${merged.added}, conflicts ${merged.conflicts}`);
  console.log(`live notes        ${live(merged.doc).length}`);
  console.log(`search "milk"     ${found.length} hit(s)`);
  console.log("");
  console.log("the tombstone travelled and the note stayed deleted");

  return merged.added === 1 && live(merged.doc).length === 2 && found.length === 1 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
