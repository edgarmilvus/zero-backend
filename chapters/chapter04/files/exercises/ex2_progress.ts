/**
 * Exercise 2 - the progress bar that lies for four seconds.
 *
 * The listener reads `size=` and divides it by the input size, which is the compressed bytes the
 * muxer has written so far and not a position in the media. On a job whose output is a tenth of
 * the input, the bar reaches 100 per cent when the encode is a tenth done.
 *
 * The repair is to divide media time by media duration, which is the only pair of numbers that
 * describe the same thing.
 */

import { parseProgress } from "../commands.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

/** The bug: bytes written so far over the input's size. */
export function wrongProgress(line: string, inputBytes: number): number {
  const size = /size=\s*(\d+)kB/.exec(line);
  if (!size) return 0;
  return Math.min(1, (Number(size[1]) * 1000) / inputBytes);
}

/** The repair: media time over media duration. */
export function rightProgress(line: string, durationMs: number): number {
  const progress = parseProgress(line);
  if (!progress || durationMs <= 0) return 0;
  return Math.min(1, progress.timeMs / durationMs);
}

const LINE = "frame=   18 fps= 15 q=28.0 size=      12kB time=00:00:01.20 bitrate=  82.4kbits/s speed=1.19x";
const INPUT = 200_000;
const DURATION = 2000;

export const checks: readonly Check[] = [
  {
    name: "the wrong bar reads the bytes written",
    run: () => expect(wrongProgress(LINE, INPUT) > 0, "should be positive"),
  },
  {
    name: "the wrong bar reads six per cent when the media is at sixty",
    run: () => eq(Math.round(wrongProgress(LINE, INPUT) * 100), 6, "per cent"),
  },
  {
    name: "the right bar is also at sixty per cent here, by coincidence",
    run: () => eq(Math.round(rightProgress(LINE, DURATION) * 100), 60, "per cent"),
  },
  {
    name: "the wrong bar jumps to a hundred early on a small output",
    run: () => {
      const small = "frame=   4 fps= 15 q=28.0 size=      20kB time=00:00:00.30 speed=1.1x";
      return eq(wrongProgress(small, 20_000), 1, "wrong bar");
    },
  },
  {
    name: "the right bar is at fifteen per cent on the same line",
    run: () => {
      const small = "frame=   4 fps= 15 q=28.0 size=      20kB time=00:00:00.30 speed=1.1x";
      return eq(Math.round(rightProgress(small, DURATION) * 100), 15, "right bar");
    },
  },
  {
    name: "a line with no time gives no position",
    run: () => eq(rightProgress("frame=  1 fps=0.0 size=0kB", DURATION), 0, "position"),
  },
  {
    name: "the bar never passes one",
    run: () =>
      eq(rightProgress("frame= 99 time=00:00:09.00 speed=1.0x", DURATION), 1, "clamped"),
  },
  {
    name: "a zero duration is refused rather than dividing by zero",
    run: () => eq(rightProgress(LINE, 0), 0, "position"),
  },
  {
    name: "the two bars disagree on the case that matters",
    run: () => {
      const small = "frame=   4 fps= 15 q=28.0 size=      20kB time=00:00:00.30 speed=1.1x";
      return expect(
        Math.abs(wrongProgress(small, 20_000) - rightProgress(small, DURATION)) > 0.5,
        "the bars agreed, so the exercise proves nothing",
      );
    },
  },
];

export function main(): number {
  console.log(`line             ${LINE.trim()}`);
  console.log(`wrong bar        ${(wrongProgress(LINE, INPUT) * 100).toFixed(0)}%`);
  console.log(`right bar        ${(rightProgress(LINE, DURATION) * 100).toFixed(0)}%`);
  console.log("");
  console.log("bytes written and media time are different clocks, and only one of them is a position");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
