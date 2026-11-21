/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 *   node chapters/chapter15/files/exercises/ex5_export.ts <export.json>
 */

import { canonicalNotes, requireNotes } from "./archive_core.ts";
import { normalize, readExport } from "./export_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_export.ts <export.json>");
    return 2;
  }

  let record;
  try {
    record = readExport(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const sample = requireNotes([
    { id: "n1", title: "Note", body: "" },
    { id: "n2", title: "Another", body: "" },
  ]);

  console.log(`notes            ${record.notes}`);
  console.log(`bytes            ${(record.bytes / 1024).toFixed(1)} kB, ${numbers.kBPerNote.toFixed(2)} kB per note`);
  console.log(`digest           ${record.digest.slice(0, 16)}...`);
  console.log(`verdict          ${record.verdict}`);
  console.log(`canonical sample ${canonicalNotes([{ id: "n1", title: "Note", body: "" }]).length} characters`);

  return numbers.readable ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
