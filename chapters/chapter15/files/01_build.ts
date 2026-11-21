/**
 * Example 1 - build one file and read it back.
 *
 *   node chapters/chapter15/files/01_build.ts
 *
 * Forty notes, a capability from chapter 14, a SHA-256 seal, and one HTML document with the reader
 * inside it. The program writes nothing: it prints the size and verifies the object it built.
 */

import { buildNotes, mintFor } from "./fixtures.ts";
import { digestOf, encodeArchive, type Archive } from "./archive.ts";
import { htmlBytes, renderHtml } from "./render.ts";
import { readEmbedded } from "./reader.ts";
import { assertVerified, renderArchive, renderVerdict } from "./report.ts";
import { verifyArchive } from "./verify.ts";

export async function main(): Promise<number> {
  const notes = buildNotes(40);
  const keys = await mintFor();
  const createdAt = Date.now();
  const archive: Archive = {
    v: 1,
    createdAt,
    notes,
    digest: await digestOf(notes),
    capability: keys.token,
  };

  const html = renderHtml(archive);
  const parsed = readEmbedded(html);
  const verdict = await verifyArchive(parsed, { now: createdAt });

  console.log(renderArchive(archive, htmlBytes(html)));
  console.log("");
  console.log(renderVerdict(verdict));
  assertVerified(verdict);

  console.log("");
  console.log(`embedded json     ${encodeArchive(archive).length} characters`);
  console.log("the file carries its notes, its permission and its reader; nothing is fetched");

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
