/**
 * The reader's arithmetic, without a browser: where the archive sits in the file, and what a reader
 * can extract from it before it trusts anything.
 */

import { decodeArchive, type Archive } from "./archive.ts";

const SCRIPT = /<script id="archive" type="application\/json">([\s\S]*?)<\/script>/;

export function readEmbedded(html: string): Archive {
  const match = html.match(SCRIPT);
  if (!match) throw new Error("file: no embedded archive; this is not an export from this chapter");
  return decodeArchive(JSON.parse(match[1] as string));
}

/** The raw JSON text inside the script, before parsing, which is what an escaping bug changes. */
export function embeddedJson(html: string): string {
  const match = html.match(SCRIPT);
  if (!match) throw new Error("file: no embedded archive");
  return match[1] as string;
}

/** How many script elements the file has: the archive, the reader, and nothing a note added. */
export function scriptCount(html: string): number {
  return (html.match(/<script\b/g) ?? []).length;
}

/** The notes the reader renders, with the text untouched: escaping happens at render, not here. */
export function renderNotes(archive: Archive): { title: string; body: string }[] {
  return archive.notes.map((note) => ({ title: note.title, body: note.body }));
}

/** What a reader decides before it renders: the seal, the permission, the clock. */
export type Verdict =
  | { readonly ok: true; readonly notes: number }
  | { readonly ok: false; readonly reason: string };

export function verdictFor(input: { digestOk: boolean; capabilityOk: boolean; expired: boolean; notes: number }): Verdict {
  if (!input.capabilityOk) return { ok: false, reason: "the permission in this file does not verify" };
  if (input.expired) return { ok: false, reason: "the permission in this file has expired" };
  if (!input.digestOk) return { ok: false, reason: "the notes were changed after the file was sealed" };
  return { ok: true, notes: input.notes };
}
