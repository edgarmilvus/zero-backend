/**
 * Example 4 - a note longer than the model's window.
 *
 *   node chapters/chapter11/files/04_chunk.ts
 *
 * The corpus notes are one sentence each, so they never need chunking. This program builds a note of
 * about a thousand words from them, splits it, and shows what the seam costs and what the overlap
 * buys: a sentence that would have been cut in half appears whole in exactly one chunk.
 */

import { NOTES } from "./corpus.ts";
import { CHUNK_OVERLAP, CHUNK_WORDS, chunk } from "./chunk.ts";

/** A long note, deterministically: the corpus repeated, with the sentence to find in the middle. */
export function longNote(): string {
  const body = [...NOTES, ...NOTES, ...NOTES].map((note) => note.text).join(" ");
  return `${body} The sentence that matters is the one about the origin private file system. ${body}`;
}

export function main(): number {
  const note = longNote();
  const words = note.split(/\s+/).length;
  const chunks = chunk(note);

  console.log(`note              ${words} words`);
  console.log(`chunks            ${chunks.length} of at most ${CHUNK_WORDS} words, ${CHUNK_OVERLAP} shared`);
  console.log(`first chunk       ${chunks[0]?.split(/\s+/).length} words`);
  console.log(`last chunk        ${chunks.at(-1)?.split(/\s+/).length} words`);
  console.log("");

  const target = "The sentence that matters is the one about the origin private file system.";
  const wholeChunks = chunks.filter((text) => text.includes(target)).length;
  const cutChunks = chunks.filter((text) => text.includes("The sentence that matters") && !text.includes(target)).length;

  console.log(`the sentence      whole in ${wholeChunks} chunk(s), cut in ${cutChunks}`);
  console.log("");
  console.log("an embedding of the whole note is an average of everything in it, and an average matches nothing");

  return wholeChunks >= 1 && cutChunks === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
