/**
 * Exercise 1 - the chunk that starts one byte late.
 *
 * Chunks computed as `index * size` with an **inclusive** end look right in a table and skip a byte at
 * every boundary: the digest is wrong, the byte count is short by the number of chunks, and nothing
 * throws.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Range = { readonly from: number; readonly to: number };

export function exclusiveRanges(size: number, chunk: number): readonly Range[] {
  const out: Range[] = [];
  for (let from = 0; from < size; from += chunk) {
    out.push({ from, to: Math.min(from + chunk, size) });
  }
  return out;
}

/** The bug: the same plan, read as if the end were inclusive, so every chunk is one byte long. */
export function buggyRead(range: Range): number {
  return range.to - range.from + 1;
}

/** The repair: a half-open range, which is what every slice in this book uses. */
export function correctRead(range: Range): number {
  return range.to - range.from;
}

/** Bytes the whole plan covers, as the consumer would read them. */
export function covered(ranges: readonly Range[], read: (range: Range) => number): number {
  return ranges.reduce((sum, range) => sum + read(range), 0);
}

const SIZE = 1000;
const CHUNK = 300;

export const checks: readonly Check[] = [
  {
    name: "the buggy read covers more than the file",
    run: () => expect(covered(exclusiveRanges(SIZE, CHUNK), buggyRead) > SIZE, "no overshoot"),
  },
  {
    name: "the repaired read covers it exactly",
    run: () => eq(covered(exclusiveRanges(SIZE, CHUNK), correctRead), SIZE, "covered"),
  },
  {
    name: "the plan's first range is 0 to 300",
    run: () => {
      const first = exclusiveRanges(SIZE, CHUNK)[0];
      eq(first?.from, 0, "from");
      return eq(first?.to, 300, "to");
    },
  },
  {
    name: "the plan's second range starts where the first ended",
    run: () => eq(exclusiveRanges(SIZE, CHUNK)[1]?.from, 300, "from"),
  },
  {
    name: "the buggy read of that range is 301 bytes",
    run: () => {
      const second = exclusiveRanges(SIZE, CHUNK)[1];
      return eq(second ? buggyRead(second) : -1, 301, "length");
    },
  },
  {
    name: "the repaired ranges are contiguous, so nothing is read twice",
    run: () => {
      const ranges = exclusiveRanges(SIZE, CHUNK);
      for (let index = 1; index < ranges.length; index += 1) {
        if (ranges[index]?.from !== ranges[index - 1]?.to) return false;
      }
      return true;
    },
  },
  {
    name: "the last range ends at the file's size",
    run: () => eq(exclusiveRanges(SIZE, CHUNK).at(-1)?.to, SIZE, "end"),
  },
  {
    name: "the overshoot is one byte per chunk, whatever the chunk size",
    run: () => {
      const ranges = exclusiveRanges(SIZE, CHUNK);
      const overshoot = covered(ranges, buggyRead) - covered(ranges, correctRead);
      return eq(overshoot, ranges.length, "overshoot");
    },
  },
];

export function main(): number {
  const ranges = exclusiveRanges(SIZE, CHUNK);
  console.log(`buggy     ${ranges.length} chunks, ${covered(ranges, buggyRead)} bytes for a ${SIZE}-byte file`);
  console.log(`repaired  ${ranges.length} chunks, ${covered(ranges, correctRead)} bytes`);
  console.log("");
  console.log("an inclusive end looks right in a table and skips a byte at every boundary");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
