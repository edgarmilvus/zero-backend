/**
 * Exercise 2 - the chunk that cut a sentence in half.
 *
 * Chunking by characters is the easy version and it splits words; chunking by words without overlap
 * splits sentences at the seam. The chapter's chunker does both correctly, and this exercise is the
 * difference measured on the same text.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

/** The bug: fixed-size slices, mid-word, no overlap. */
export function byCharacters(text: string, size: number): string[] {
  if (!Number.isInteger(size) || size <= 0) throw new Error(`size: ${size} is not a positive integer`);
  const out: string[] = [];
  for (let start = 0; start < text.length; start += size) out.push(text.slice(start, start + size));
  return out;
}

/** The repair: word boundaries, a maximum size, and an overlap so a seam loses nothing. */
export function byWords(text: string, size: number, overlap: number): string[] {
  if (!Number.isInteger(size) || size <= 0) throw new Error(`size: ${size} is not a positive integer`);
  if (!Number.isInteger(overlap) || overlap < 0) throw new Error(`overlap: ${overlap} is not a non-negative integer`);
  if (overlap >= size) throw new Error(`overlap ${overlap} must be smaller than the size ${size}`);

  const words = text.trim().split(/\s+/);
  if (text.trim() === "") throw new Error("chunk: an empty text has no chunks");
  if (words.length <= size) return [text.trim()];

  const step = size - overlap;
  const out: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    out.push(words.slice(start, start + size).join(" "));
    if (start + size >= words.length) break;
  }
  return out;
}

const TEXT = "the quick brown fox jumps over the lazy dog and then keeps running through the field";
const LONG = Array.from({ length: 200 }, (_, index) => `w${index}`).join(" ");

export const checks: readonly Check[] = [
  {
    name: "character chunks split words",
    run: () => {
      const chunks = byCharacters(TEXT, 7);
      return expect(chunks.some((chunk) => !chunk.endsWith(" ") && !TEXT.includes(`${chunk} `)), "nothing was split");
    },
  },
  {
    name: "word chunks never split a word",
    run: () => expect(byWords(TEXT, 5, 1).every((chunk) => chunk.split(" ").every((word) => TEXT.includes(word))), "split"),
  },
  {
    name: "the first chunk is the requested number of words",
    run: () => eq(byWords(LONG, 60, 15)[0]?.split(" ").length, 60, "words"),
  },
  {
    name: "consecutive chunks share the overlap",
    run: () => {
      const chunks = byWords(LONG, 60, 15);
      const first = chunks[0]?.split(" ") ?? [];
      const second = chunks[1]?.split(" ") ?? [];
      return eq(second.slice(0, 15).join(","), first.slice(-15).join(","), "overlap");
    },
  },
  {
    name: "no chunk exceeds the size",
    run: () => expect(byWords(LONG, 60, 15).every((chunk) => chunk.split(" ").length <= 60), "oversized"),
  },
  {
    name: "a text shorter than the size is one chunk",
    run: () => eq(byWords(TEXT, 100, 10).length, 1, "chunks"),
  },
  {
    name: "two hundred words at sixty with fifteen of overlap are five chunks",
    run: () => eq(byWords(LONG, 60, 15).length, 5, "chunks"),
  },
  {
    name: "an overlap as large as the size is refused",
    run: () => {
      const error = throws(() => byWords(LONG, 10, 10), "overlap");
      return expect(error.message.includes("smaller"), error.message);
    },
  },
  {
    name: "an empty text is refused",
    run: () => {
      const error = throws(() => byWords("   ", 10, 2), "empty");
      return expect(error.message.includes("empty"), error.message);
    },
  },
];

export function main(): number {
  console.log(`by characters     ${byCharacters(TEXT, 20).length} chunks, ending mid-word: "${byCharacters(TEXT, 20)[0]?.slice(-4)}"`);
  console.log(`by words          ${byWords(LONG, 60, 15).length} chunks of at most 60, 15 shared`);
  console.log("");
  console.log("a chunk that ends mid-sentence embeds a clause without its subject");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
