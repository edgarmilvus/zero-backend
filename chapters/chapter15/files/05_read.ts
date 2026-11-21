/**
 * Example 5 - a reader that refuses a file it cannot understand.
 *
 *   node chapters/chapter15/files/05_read.ts
 *
 * Three files a reader might be handed: one it understands, one with no archive at all, and one whose
 * JSON was broken by an editor. Each failure names what is wrong, and none renders a note.
 */

import { buildNotes, mintFor } from "./fixtures.ts";
import { digestOf, type Archive } from "./archive.ts";
import { readEmbedded } from "./reader.ts";
import { renderHtml } from "./render.ts";
import { assertRefuses, renderVerdict } from "./report.ts";
import { verifyArchive } from "./verify.ts";

export async function main(): Promise<number> {
  const notes = buildNotes(4);
  const keys = await mintFor();
  const archive: Archive = { v: 1, createdAt: Date.now(), notes, digest: await digestOf(notes), capability: keys.token };
  const good = renderHtml(archive);

  console.log(renderVerdict(await verifyArchive(readEmbedded(good), { now: Date.now() })));

  let refused = 0;
  for (const [label, file] of [
    ["no archive", "<html><body>hello</body></html>"],
    ["broken json", good.replace('"digest":"', '"digest":')],
    ["no capability", good.replace(/"capability":"[^"]*"/, '"capability":""')],
  ] as const) {
    try {
      const parsed = readEmbedded(file);
      const verdict = await verifyArchive(parsed, { now: Date.now() });
      console.log(`${label.padEnd(16)} ${renderVerdict(verdict)}`);
      if (!verdict.ok) refused += 1;
      else throw new Error(`${label}: verified a file it should refuse`);
    } catch (error) {
      console.log(`${label.padEnd(16)} refused           ${(error as Error).message.slice(0, 64)}`);
      refused += 1;
    }
  }

  console.log("");
  console.log(`${refused}/3 malformed files refused before a single note is rendered`);
  return refused === 3 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
