/**
 * Exercise 3 - the peak that nobody measured.
 *
 * A report shows the heap at 64 MB while the process holds 1.1 GB, because a Buffer lives outside the
 * V8 heap. A budget written against `heapUsed` is a budget that never fires before the tab dies.
 */

import { expect, near, type Check } from "./selfcheck.ts";

export type Usage = {
  readonly heapUsed: number;
  readonly external: number;
  readonly rss: number;
};

/** What a whole-file read adds: the file, plus the digest's working copy. */
export function wholeUsage(sizeBytes: number, base: Usage): Usage {
  return {
    heapUsed: base.heapUsed,
    external: base.external + sizeBytes,
    rss: base.rss + sizeBytes,
  };
}

/** What a chunked read adds: one chunk, twice, because the reader returns a copy. */
export function chunkedUsage(sizeBytes: number, chunkBytes: number, base: Usage): Usage {
  const held = Math.min(sizeBytes, chunkBytes) * 2;
  return {
    heapUsed: base.heapUsed,
    external: base.external + held,
    rss: base.rss + held,
  };
}

const BASE: Usage = { heapUsed: 40e6, external: 5e6, rss: 90e6 };
const SIZE = 1e9;
const BUDGET = 256e6;

export const checks: readonly Check[] = [
  {
    name: "the whole read leaves the heap untouched",
    run: () => near(wholeUsage(SIZE, BASE).heapUsed, BASE.heapUsed, 1, "heap"),
  },
  {
    name: "and puts the file in external memory",
    run: () => near(wholeUsage(SIZE, BASE).external, BASE.external + SIZE, 1, "external"),
  },
  {
    name: "so a budget written against the heap never fires",
    run: () => expect(wholeUsage(SIZE, BASE).heapUsed < BUDGET, "fired"),
  },
  {
    name: "while the process is four times over the budget",
    run: () => expect(wholeUsage(SIZE, BASE).rss > BUDGET * 3, "under"),
  },
  {
    name: "the chunked read stays flat at any file size",
    run: () => {
      const small = chunkedUsage(1e9, 64e6, BASE).rss;
      const large = chunkedUsage(1e12, 64e6, BASE).rss;
      return near(small, large, 1, "rss");
    },
  },
  {
    name: "and under the budget at 64 MB chunks",
    run: () => expect(chunkedUsage(SIZE, 64e6, BASE).rss < BUDGET, "over"),
  },
  {
    name: "a chunk larger than the file holds the file",
    run: () => near(chunkedUsage(1000, 64e6, BASE).rss, BASE.rss + 2000, 1, "rss"),
  },
  {
    name: "the difference between the strategies is the file size",
    run: () =>
      near(wholeUsage(SIZE, BASE).rss - chunkedUsage(SIZE, 64e6, BASE).rss, SIZE - 128e6, 1, "difference"),
  },
  {
    name: "a report that reads rss catches what a heap report misses",
    run: () => expect(wholeUsage(SIZE, BASE).rss !== wholeUsage(SIZE, BASE).heapUsed, "equal"),
  },
  {
    name: "the chunked peak is twice the chunk, not twice the file",
    run: () => near(chunkedUsage(SIZE, 64e6, BASE).rss - BASE.rss, 128e6, 1, "held"),
  },
];

export function main(): number {
  const whole = wholeUsage(SIZE, BASE);
  const chunked = chunkedUsage(SIZE, 64e6, BASE);
  console.log(`whole    heap ${(whole.heapUsed / 1e6).toFixed(0)} MB, external ${(whole.external / 1e6).toFixed(0)} MB, rss ${(whole.rss / 1e6).toFixed(0)} MB`);
  console.log(`chunked  heap ${(chunked.heapUsed / 1e6).toFixed(0)} MB, external ${(chunked.external / 1e6).toFixed(0)} MB, rss ${(chunked.rss / 1e6).toFixed(0)} MB`);
  console.log("");
  console.log("the heap is the number that does not move, which is why it is the wrong number to budget");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
