/**
 * Exercise 1 - the EXIF tag read from the wrong side of the pair.
 *
 * An entry holds either the value or an offset to it, and the offset's base is the TIFF header
 * rather than the file. Read it from the file and every long value lands in the segment header,
 * which prints as a name made of stray bytes and raises no error.
 */

import { eq, type Check } from "./selfcheck.ts";

export type Entry = { readonly tag: number; readonly length: number; readonly valueAt: number };

/** The bug: the offset is used as a file position. */
export function buggyValueOffset(entry: Entry): number {
  return entry.valueAt;
}

/** The repair: the offset is relative to the TIFF header, which sits after `Exif\0\0`. */
export function fixedValueOffset(entry: Entry, tiffAt: number): number {
  return tiffAt + entry.valueAt;
}

/** A value of four bytes or fewer lives inside the entry and is not an offset at all. */
export function isInline(entry: Entry, typeBytes: number): boolean {
  return typeBytes * entry.length <= 4;
}

const TIFF = 6;
const LONG_TEXT: Entry = { tag: 0x0110, length: 13, valueAt: 120 };

export const checks: readonly Check[] = [
  {
    name: "the buggy reader returns the offset unchanged",
    run: () => eq(buggyValueOffset(LONG_TEXT), 120, "offset"),
  },
  {
    name: "the repaired reader adds the header",
    run: () => eq(fixedValueOffset(LONG_TEXT, TIFF), 126, "offset"),
  },
  {
    name: "the two disagree by the header's position",
    run: () => eq(fixedValueOffset(LONG_TEXT, TIFF) - buggyValueOffset(LONG_TEXT), TIFF, "gap"),
  },
  {
    name: "a four-byte value is inline",
    run: () => eq(isInline({ tag: 1, length: 2, valueAt: 0 }, 2), true, "inline"),
  },
  {
    name: "a five-byte value is not inline",
    run: () => eq(isInline({ tag: 1, length: 5, valueAt: 0 }, 1), false, "inline"),
  },
  {
    name: "a thirteen-character string is stored out of line",
    run: () => eq(isInline(LONG_TEXT, 1), false, "inline"),
  },
  {
    name: "an offset of zero still needs the header added",
    run: () => eq(fixedValueOffset({ tag: 1, length: 9, valueAt: 0 }, TIFF), TIFF, "offset"),
  },
  {
    name: "an inline value keeps its place",
    run: () => {
      const entry: Entry = { tag: 0x0112, length: 1, valueAt: 6 };
      return eq(isInline(entry, 2) ? entry.valueAt : fixedValueOffset(entry, TIFF), 6, "value");
    },
  },
];

export function main(): number {
  console.log("an entry's offset is relative to the TIFF header, not to the file");
  console.log(`  buggy     ${buggyValueOffset(LONG_TEXT)}`);
  console.log(`  repaired  ${fixedValueOffset(LONG_TEXT, TIFF)}`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
