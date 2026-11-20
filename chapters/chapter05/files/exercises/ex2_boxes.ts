/**
 * Exercise 2 - the box that claims to be larger than the file.
 *
 * A truncated download keeps its first four bytes, so the box says "moov, 900,000 bytes" and the
 * file has 400,000. A parser that trusts the header reads past the end of the buffer, and a
 * parser that allocates the declared size first allocates 900 kB of nothing.
 *
 * The repair is two checks: a box must fit the bytes that exist, and a box must be at least as
 * large as its own header. Both are one line and both stop the walk.
 */

import { readBoxes } from "../boxes.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

/** Builds a box header with a declared size, plus whatever payload is given. */
export function box(type: string, declared: number, payloadBytes: number): Uint8Array {
  const buffer = new Uint8Array(8 + payloadBytes);
  new DataView(buffer.buffer).setUint32(0, declared);
  buffer.set([...type].map((character) => character.charCodeAt(0)), 4);
  return buffer;
}

/** The bug: trust the header and slice. */
export function buggyRead(bytes: Uint8Array): number {
  let at = 0;
  let count = 0;
  while (at + 8 <= bytes.byteLength) {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, false);
    at += size;
    count += 1;
  }
  return count;
}

export const checks: readonly Check[] = [
  {
    name: "a box that fits is read",
    run: () => eq(readBoxes(box("free", 16, 8)).length, 1, "boxes"),
  },
  {
    name: "a box that claims more than the buffer is not read",
    run: () => eq(readBoxes(box("moov", 900_000, 8)).length, 0, "boxes"),
  },
  {
    name: "a box smaller than its header is not read",
    run: () => eq(readBoxes(box("free", 4, 8)).length, 0, "boxes"),
  },
  {
    name: "the buggy reader loops off the end and reports one box",
    run: () => eq(buggyRead(box("moov", 900_000, 8)), 1, "boxes"),
  },
  {
    name: "two valid boxes are both read",
    run: () => {
      const first = box("free", 16, 8);
      const second = box("mdat", 16, 8);
      const joined = new Uint8Array(first.byteLength + second.byteLength);
      joined.set(first, 0);
      joined.set(second, first.byteLength);
      return eq(readBoxes(joined).length, 2, "boxes");
    },
  },
  {
    name: "a valid box followed by a broken one stops at the boundary",
    run: () => {
      const first = box("free", 16, 8);
      const broken = box("moov", 5000, 8);
      const joined = new Uint8Array(first.byteLength + broken.byteLength);
      joined.set(first, 0);
      joined.set(broken, first.byteLength);
      const parsed = readBoxes(joined);
      eq(parsed.length, 1, "boxes");
      return eq(parsed[0]?.type, "free", "type");
    },
  },
  {
    name: "a size of zero means the rest of the buffer",
    run: () => {
      const buffer = box("mdat", 0, 40);
      const parsed = readBoxes(buffer);
      return eq(parsed[0]?.bytes, buffer.byteLength, "bytes");
    },
  },
  {
    name: "sixteen bytes with no full header is an empty tree",
    run: () => eq(readBoxes(new Uint8Array(4)).length, 0, "boxes"),
  },
  {
    name: "the repair reports what it read instead of throwing",
    run: () => {
      const parsed = readBoxes(box("moov", 900_000, 8));
      return expect(Array.isArray(parsed) && parsed.length === 0, "not an empty array");
    },
  },
];

export function main(): number {
  console.log(`valid box        ${readBoxes(box("free", 16, 8)).length} read`);
  console.log(`truncated box    ${readBoxes(box("moov", 900_000, 8)).length} read (the walk stopped)`);
  console.log(`the buggy reader ${buggyRead(box("moov", 900_000, 8))} read (trusting the header)`);
  console.log("");
  console.log("a size is a claim, and the buffer is the fact");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
