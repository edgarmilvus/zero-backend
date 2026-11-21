/**
 * Example 4 - what a notebook weighs.
 *
 *   node chapters/chapter15/files/04_size.ts
 *
 * The reader is 2 kB of script, the capability 306 characters, and the rest is the notes. The base64
 * number is there because the first version of the format put the archive in a data URL, which is a
 * third larger and then escaped again.
 */

import { buildNotes, mintFor } from "./fixtures.ts";
import { digestOf, type Archive } from "./archive.ts";
import { htmlBytes, renderHtml } from "./render.ts";

const b64 = (bytes: number): number => Math.ceil(bytes / 3) * 4;

export async function main(): Promise<number> {
  const keys = await mintFor();
  const rows: number[] = [];

  for (const count of [1, 100, 1_000]) {
    const notes = buildNotes(count);
    const archive: Archive = { v: 1, createdAt: Date.now(), notes, digest: await digestOf(notes), capability: keys.token };
    const html = renderHtml(archive);
    const bytes = htmlBytes(html);
    rows.push(bytes);
    console.log(
      `${String(count).padStart(4)} notes        ${(bytes / 1024).toFixed(1).padStart(8)} kB file, ` +
        `${(b64(bytes) / 1024).toFixed(1).padStart(8)} kB as base64, ` +
        `${(bytes / count / 1024).toFixed(2)} kB per note`,
    );
  }

  console.log("");
  console.log(`the reader is a constant; the notes are the line, and a thousand of them is ${(rows[2]! / 1024 / 1024).toFixed(1)} MB`);

  return rows[0]! < rows[1]! && rows[1]! < rows[2]! ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
