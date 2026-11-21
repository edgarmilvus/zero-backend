/**
 * Exercise 3 - the line that was too long.
 *
 * iCalendar folds at 75 octets, and an emoji is four. Folding by characters produces lines a reader
 * counts as short and a parser counts as long, and the continuation can split a UTF-8 sequence.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

const encoder = new TextEncoder();

/** The bug: count characters. */
export function byCharacters(line: string, width = 75): string {
  if (line.length <= width) return line;
  const parts: string[] = [];
  for (let index = 0; index < line.length; index += width) parts.push(line.slice(index, index + width));
  return parts.join("\r\n ");
}

/** The repair: count octets and never split a character. */
export function byOctets(line: string, width = 75): string {
  if (encoder.encode(line).byteLength <= width) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).byteLength;
    if (size + bytes > width) {
      parts.push(current);
      current = character;
      size = bytes;
    } else {
      current += character;
      size += bytes;
    }
  }
  if (current) parts.push(current);
  return parts.join("\r\n ");
}

const LONG = `SUMMARY:${"x".repeat(100)}`;
const EMOJI = `SUMMARY:${"🎉".repeat(30)}`;

export const checks: readonly Check[] = [
  { name: "a short line is unchanged", run: () => eq(byOctets("SUMMARY:a"), "SUMMARY:a", "line") },
  { name: "a long ascii line is folded", run: () => expect(byOctets(LONG).includes("\r\n "), "no fold") },
  { name: "every folded line is at most 75 octets", run: () => expect(byOctets(EMOJI).split("\r\n").every((line) => encoder.encode(line).byteLength <= 75), "over") },
  { name: "the character version folds the emoji by characters", run: () => expect(byCharacters(EMOJI).split("\r\n")[0]!.length <= 75, "characters") },
  { name: "and its first line is over 75 octets", run: () => expect(encoder.encode(byCharacters(EMOJI).split("\r\n")[0]!).byteLength > 75, "octets") },
  { name: "unfolding restores the octet version", run: () => eq(byOctets(EMOJI).replace(/\r\n /g, ""), EMOJI, "round trip") },
  { name: "unfolding restores the character version too", run: () => eq(byCharacters(EMOJI).replace(/\r\n /g, ""), EMOJI, "round trip") },
  { name: "the fold is deterministic", run: () => eq(byOctets(LONG), byOctets(LONG), "stable") },
  { name: "a line of exactly 75 octets is not folded", run: () => eq(byOctets(`X:${"y".repeat(73)}`).includes("\r\n"), false, "folded") },
  { name: "the two versions differ on the emoji", run: () => expect(byCharacters(EMOJI) !== byOctets(EMOJI), "same") },
];

export function main(): number {
  console.log(`by chars          ${encoder.encode(byCharacters(EMOJI).split("\r\n")[0]!).byteLength} octets on line 1`);
  console.log(`by octets         ${encoder.encode(byOctets(EMOJI).split("\r\n")[0]!).byteLength} octets on line 1`);
  console.log("");
  console.log("a fold is a byte count, and an emoji is four bytes");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
