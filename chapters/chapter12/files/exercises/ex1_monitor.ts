/**
 * Exercise 1 - the monitor that missed the tail.
 *
 * A freeze is the gap between the last frame and the moment the work ended. A monitor that only looks
 * at recorded frames sees 16.7 ms and calls it smooth, while the page stood still for six hundred.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Stats = { readonly frames: number; readonly maxGapMs: number };

/** The bug: only the recorded frames. */
export function gapsBetween(stamps: readonly number[]): number {
  let worst = 0;
  for (let index = 1; index < stamps.length; index += 1) worst = Math.max(worst, (stamps[index] as number) - (stamps[index - 1] as number));
  return worst;
}

/** The repair: the window's start and end are stamps too. */
export function windowGap(stamps: readonly number[], start: number, end: number): Stats {
  if (end < start) throw new Error(`window: end ${end} is before start ${start}`);
  const all = [start, ...stamps.filter((stamp) => stamp > start && stamp < end), end];
  let worst = 0;
  for (let index = 1; index < all.length; index += 1) worst = Math.max(worst, (all[index] as number) - (all[index - 1] as number));
  return { frames: stamps.length, maxGapMs: worst };
}

const STAMPS = [0, 16, 33, 50];

export const checks: readonly Check[] = [
  { name: "the frame-only gap is smooth", run: () => eq(gapsBetween(STAMPS), 17, "gap") },
  { name: "the window gap sees the freeze at the end", run: () => eq(windowGap(STAMPS, 0, 650).maxGapMs, 600, "gap") },
  { name: "a window with no frames is one long gap", run: () => eq(windowGap([], 0, 100).maxGapMs, 100, "gap") },
  { name: "the frame count is the frames, not the stamps", run: () => eq(windowGap(STAMPS, 0, 650).frames, 4, "frames") },
  {
    name: "a window that ends before it starts is refused",
    run: () => {
      const error = throws(() => windowGap([], 10, 5), "window");
      return expect(error.message.includes("before"), error.message);
    },
  },
  {
    name: "a freeze in the middle is the same number either way",
    run: () => eq(gapsBetween([0, 16, 700, 716]), windowGap([0, 16, 700, 716], 0, 720).maxGapMs, "middle"),
  },
  { name: "the slow window is the one with the hidden tail", run: () => expect(windowGap(STAMPS, 0, 650).maxGapMs > 10 * gapsBetween(STAMPS), "fixture") },
  { name: "a steady window reports the frame interval", run: () => eq(windowGap([16, 33, 50, 67], 0, 67).maxGapMs, 17, "steady") },
];

export function main(): number {
  console.log(`frames only       ${gapsBetween(STAMPS)} ms`);
  console.log(`with the window   ${windowGap(STAMPS, 0, 650).maxGapMs} ms`);
  console.log("");
  console.log("a monitor that does not know when the work ended cannot see the work");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
