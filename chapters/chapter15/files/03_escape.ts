/**
 * Example 3 - the note that closed the script tag.
 *
 *   node chapters/chapter15/files/03_escape.ts
 *
 * A title of `</script><img src=x onerror=alert(1)>` is the obvious attack on a format that embeds
 * JSON in HTML. The file must contain the note and must not contain a second script element.
 */

import { buildNotes, mintFor } from "./fixtures.ts";
import { digestOf, type Archive } from "./archive.ts";
import { embeddedJson, readEmbedded, scriptCount } from "./reader.ts";
import { renderHtml } from "./render.ts";

const NASTY = '</script><img src=x onerror="alert(1)"><script>alert(2)</script>';

export async function main(): Promise<number> {
  const notes = buildNotes(3).map((note, index) => (index === 1 ? { ...note, title: NASTY } : note));
  const keys = await mintFor();
  const archive: Archive = { v: 1, createdAt: Date.now(), notes, digest: await digestOf(notes), capability: keys.token };
  const html = renderHtml(archive);

  const raw = embeddedJson(html);
  const parsed = readEmbedded(html);

  console.log(`scripts in file   ${scriptCount(html)}`);
  console.log(`raw "</script"    ${raw.includes("</script")}`);
  console.log(`title round trip  ${parsed.notes[1]?.title === NASTY}`);
  console.log("");
  console.log("the note is data: the parser never sees its tags, and the reader renders it as text");

  const safe = scriptCount(html) === 2 && !raw.includes("</script") && parsed.notes[1]?.title === NASTY;
  return safe ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
