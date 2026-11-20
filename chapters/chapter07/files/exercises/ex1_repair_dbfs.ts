/**
 * Exercise 1 - the decibels that are a factor of two out.
 *
 * A meter computes twenty times the log of the mean square instead of the root mean square. A sine
 * at half amplitude should read -9.03 dBFS and reads -12.05, so every threshold in the product is
 * three decibels off and nobody notices until a compressor stops engaging.
 */

import { dbfs } from "../audio.ts";
import { eq, expect, near, type Check } from "./selfcheck.ts";

export function meanSquare(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return sum / samples.length;
}

/** The bug: twenty log of the mean square. */
export function buggyRmsDbfs(samples: Float32Array): number {
  const mean = meanSquare(samples);
  return mean <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(mean);
}

/** The repair: twenty log of the root mean square. */
export function fixedRmsDbfs(samples: Float32Array): number {
  const mean = meanSquare(samples);
  return mean <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(Math.sqrt(mean));
}

const TONE = Float32Array.from({ length: 4410 }, (_, index) => 0.5 * Math.sin((2 * Math.PI * 440 * index) / 44100));

export const checks: readonly Check[] = [
  {
    name: "the buggy meter reads twice the decibels for a tone at half amplitude",
    run: () => near(buggyRmsDbfs(TONE), -18.06, 0.05, "buggy"),
  },
  {
    name: "the repaired meter reads nine",
    run: () => near(fixedRmsDbfs(TONE), -9.03, 0.05, "fixed"),
  },
  {
    name: "the buggy reading is exactly twice the repaired one",
    run: () => near(buggyRmsDbfs(TONE) / fixedRmsDbfs(TONE), 2, 0.01, "ratio"),
  },
  {
    name: "a full-scale square wave reads zero on the repaired meter",
    run: () => near(fixedRmsDbfs(new Float32Array([1, -1, 1, -1])), 0, 1e-9, "rms"),
  },
  {
    name: "a quarter-amplitude tone is fifteen decibels down, and the bug reads thirty",
    run: () => {
      const quiet = Float32Array.from(TONE, (sample) => sample * 0.5);
      near(fixedRmsDbfs(quiet), -15.05, 0.05, "fixed");
      return near(buggyRmsDbfs(quiet), -30.1, 0.05, "buggy");
    },
  },
  {
    name: "silence is minus infinity on both",
    run: () => {
      eq(fixedRmsDbfs(new Float32Array(4)), Number.NEGATIVE_INFINITY, "fixed");
      return eq(buggyRmsDbfs(new Float32Array(4)), Number.NEGATIVE_INFINITY, "buggy");
    },
  },
  {
    name: "the repair agrees with the chapter's own dbfs",
    run: () => near(fixedRmsDbfs(TONE), dbfs(Math.sqrt(meanSquare(TONE))), 1e-9, "agree"),
  },
  {
    name: "halving the amplitude moves the repaired meter by six decibels",
    run: () => {
      const quiet = Float32Array.from(TONE, (sample) => sample * 0.5);
      return near(fixedRmsDbfs(quiet), fixedRmsDbfs(TONE) - 6.02, 0.05, "quiet");
    },
  },
];

export function main(): number {
  console.log(`buggy     ${buggyRmsDbfs(TONE).toFixed(2)} dBFS`);
  console.log(`repaired  ${fixedRmsDbfs(TONE).toFixed(2)} dBFS`);
  console.log("");
  console.log("three decibels is a factor of two in amplitude, and it is the difference between a meter and a guess");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
