/**
 * Exercise 2 - the batch that was one text too large.
 *
 * A worker takes a batch, and a batch is two limits: a count and a character budget. A page that sends
 * a whole corpus in one message gets a refusal, or worse, a call that takes ten seconds and blocks
 * every message behind it.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export const MAX_TEXTS = 32;
export const MAX_CHARS = 4_000;

export function batch(texts: readonly string[]): string[][] {
  if (texts.length === 0) throw new Error("batch: nothing to embed");
  for (const [index, text] of texts.entries()) {
    if (text.trim() === "") throw new Error(`batch: text ${index} is empty`);
    if (text.length > MAX_CHARS) throw new Error(`batch: text ${index} is ${text.length} characters, the limit is ${MAX_CHARS}`);
  }

  const out: string[][] = [];
  let current: string[] = [];
  let characters = 0;

  for (const text of texts) {
    const overCount = current.length + 1 > MAX_TEXTS;
    const overChars = characters + text.length > MAX_CHARS;
    if (current.length > 0 && (overCount || overChars)) {
      out.push(current);
      current = [];
      characters = 0;
    }
    current.push(text);
    characters += text.length;
  }
  if (current.length > 0) out.push(current);
  return out;
}

export function batchCount(texts: readonly string[]): number {
  return batch(texts).length;
}

export const checks: readonly Check[] = [
  { name: "a small batch is one message", run: () => eq(batch(["a", "b"]).length, 1, "batches") },
  { name: "thirty-two texts fit in one message", run: () => eq(batch(Array.from({ length: 32 }, () => "x")).length, 1, "batches") },
  { name: "the thirty-third starts a second message", run: () => eq(batch(Array.from({ length: 33 }, () => "x")).length, 2, "batches") },
  { name: "the count limit is honoured exactly", run: () => eq(batch(Array.from({ length: 64 }, () => "x")).map((rows) => rows.length).join(","), "32,32", "sizes") },
  {
    name: "the character budget splits a batch before the count does",
    run: () => eq(batch(Array.from({ length: 3 }, () => "x".repeat(1_500))).map((row) => row.length).join(","), "2,1", "sizes"),
  },
  {
    name: "every text appears exactly once",
    run: () => {
      const texts = Array.from({ length: 70 }, (_unused, index) => `text ${index}`);
      return eq(batch(texts).flat().join("|"), texts.join("|"), "order");
    },
  },
  { name: "no batch exceeds the count limit", run: () => expect(batch(Array.from({ length: 100 }, () => "x")).every((rows) => rows.length <= MAX_TEXTS), "oversized") },
  {
    name: "an empty list is refused",
    run: () => {
      const error = throws(() => batch([]), "empty");
      return expect(error.message.includes("nothing"), error.message);
    },
  },
  {
    name: "a text over the character limit is refused instead of split silently",
    run: () => {
      const error = throws(() => batch(["x".repeat(MAX_CHARS + 1)]), "long");
      return expect(error.message.includes("limit"), error.message);
    },
  },
];

export function main(): number {
  const texts = Array.from({ length: 70 }, (_unused, index) => `note ${index}`);
  console.log(`70 texts          ${batch(texts).length} batches of at most ${MAX_TEXTS}`);
  console.log("");
  console.log("a batch is a count and a budget, and the smaller one wins");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
