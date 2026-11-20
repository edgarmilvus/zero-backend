/**
 * Exercise 1 - the timestamps that are a thousand times too big.
 *
 * The page builds timestamps in milliseconds and hands them to `VideoDecoder.decode`, which reads
 * microseconds. Nothing throws: the first frame lands at 0.24 s, the decoder's queue orders by a
 * clock that advances a thousand times too slowly, and the video plays at a thousandth of its
 * speed or drops frames depending on the buffer.
 */

import { frameTimes, usFromTimescale } from "../frames.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

/** The bug: the frame index times the frame duration in milliseconds. */
export function inMilliseconds(frameCount: number, fps: number): readonly number[] {
  return Array.from({ length: frameCount }, (_, index) => Math.round((index * 1000) / fps));
}

/** The repair: microseconds, from the same frame rate. */
export function inMicroseconds(frameCount: number, fps: number): readonly number[] {
  return frameTimes(frameCount, fps);
}

export const checks: readonly Check[] = [
  {
    name: "the buggy array is a thousand times too small",
    run: () => eq(inMilliseconds(2, 30)[1], 33, "ms"),
  },
  {
    name: "the repaired array is the same number in microseconds",
    run: () => eq(inMicroseconds(2, 30)[1], 33_333, "us"),
  },
  {
    name: "the two arrays differ by a factor of a thousand",
    run: () => {
      const ratio = (inMicroseconds(10, 30)[9] ?? 0) / (inMilliseconds(10, 30)[9] ?? 1);
      return expect(ratio > 999 && ratio < 1001, `ratio ${ratio}`);
    },
  },
  {
    name: "the buggy first frame is at 0 us",
    run: () => eq(inMilliseconds(4, 25)[0], 0, "first"),
  },
  {
    name: "both arrays are monotonic",
    run: () => {
      const times = inMicroseconds(5, 24);
      return eq(times.every((value, index) => index === 0 || value > (times[index - 1] ?? -1)), true, "monotonic");
    },
  },
  {
    name: "converting the buggy number as units lands on neither clock",
    run: () => {
      const wrong = inMilliseconds(2, 30)[1] ?? 0;
      const asUnits = usFromTimescale(wrong, 15360);
      // 33 ms read as 33 units at 15360 is 2,148 us: not the 33,333 the page meant, and not 33.
      return expect(asUnits > 2000 && asUnits < 2300, `got ${asUnits} us`);
    },
  },
  {
    name: "a frame rate that does not divide a second still rounds up",
    run: () => eq(inMicroseconds(2, 24)[1], 41_667, "us"),
  },
  {
    name: "the repair is exactly the chapter's own function",
    run: () => eq(inMicroseconds(6, 30).join(","), frameTimes(6, 30).join(","), "same"),
  },
];

export function main(): number {
  console.log(`in milliseconds   ${inMilliseconds(4, 30).join(", ")}`);
  console.log(`in microseconds   ${inMicroseconds(4, 30).join(", ")}`);
  console.log("");
  console.log("the decoder does not throw: it believes the smaller numbers");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
