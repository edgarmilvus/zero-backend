/**
 * Example 2 - the note that was edited after the seal.
 *
 *   node chapters/chapter15/files/02_tamper.ts
 *
 * The digest is over the notes, so changing one character of one body changes the digest and the
 * reader refuses. A signature over the whole file would have made this a signature failure instead of
 * a content failure; the chapter keeps them separate on purpose.
 */

import { buildNotes, mintFor } from "./fixtures.ts";
import { digestOf, type Archive } from "./archive.ts";
import { assertRefuses, renderVerdict } from "./report.ts";
import { verifyArchive } from "./verify.ts";

export async function main(): Promise<number> {
  const notes = buildNotes(5);
  const keys = await mintFor();
  const createdAt = Date.now();
  const archive: Archive = { v: 1, createdAt, notes, digest: await digestOf(notes), capability: keys.token };

  const edited: Archive = {
    ...archive,
    notes: archive.notes.map((note, index) => (index === 2 ? { ...note, body: `${note.body} edited` } : note)),
  };

  const verdict = await verifyArchive(edited, { now: createdAt });
  console.log(renderVerdict(verdict));
  assertRefuses(verdict, "changed after the file was sealed");

  const capabilityEdited: Archive = { ...archive, capability: `${archive.capability.slice(0, -4)}AAAA` };
  const second = await verifyArchive(capabilityEdited, { now: createdAt });
  console.log(renderVerdict(second));
  assertRefuses(second, "");

  console.log("");
  console.log("two seals, two failures: the notes are the content, the capability is the permission");

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
