/**
 * Exercise 2 - the waveform built from averages.
 *
 * A peak file built by averaging samples hides every transient: a clipped drum looks quiet in the
 * editor, the user exports distortion, and the waveform that was supposed to warn them drew a
 * smooth line.
 */

import { peaks } from "../audio.ts";
import { eq, expect, near, type Check } from "./selfcheck.ts";

/** The bug: one mean per bucket. */
export function averaged(samples: Float32Array, buckets: number): readonly number[] {
  const perBucket = Math.ceil(samples.length / buckets);
  const out: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const from = bucket * perBucket;
    const to = Math.min(samples.length, from + perBucket);
    let sum = 0;
    for (let index = from; index < to; index += 1) sum += samples[index] ?? 0;
    out.push(to > from ? sum / (to - from) : 0);
  }
  return out;
}

/** A click in an otherwise quiet second: one sample at full scale. */
export const CLICK = (() => {
  const samples = new Float32Array(44100).fill(0.01);
  samples[22050] = 0.99;
  return samples;
})();

export const checks: readonly Check[] = [
  {
    name: "the average of the click bucket is nearly quiet",
    run: () => expect(Math.abs(averaged(CLICK, 100)[50] ?? 0) < 0.05, "loud average"),
  },
  {
    name: "the peak of the same bucket is full scale",
    run: () => near(peaks(CLICK, 100)[50]?.max ?? 0, 0.99, 1e-6, "peak"),
  },
  {
    name: "so the two disagree about what happened",
    run: () => {
      const mean = Math.abs(averaged(CLICK, 100)[50] ?? 0);
      const peak = peaks(CLICK, 100)[50]?.max ?? 0;
      return expect(peak > mean * 20, `${peak} vs ${mean}`);
    },
  },
  {
    name: "the peak keeps the sign of the loudest sample",
    run: () => {
      const negative = new Float32Array([0.1, -0.9, 0.1]);
      const bucket = peaks(negative, 1)[0];
      if (!bucket) throw new Error("no bucket");
      near(bucket.min, -0.9, 1e-6, "min");
      return near(bucket.max, 0.1, 1e-6, "max");
    },
  },
  {
    name: "a bucket of one sample is that sample",
    run: () => near(peaks(new Float32Array([0.3]), 1)[0]?.max ?? 0, 0.3, 1e-6, "peak"),
  },
  {
    name: "the reduction is exact when the buckets divide the samples",
    run: () => eq(peaks(new Float32Array(100), 10).length, 10, "buckets"),
  },
  {
    name: "the reduction rounds up when they do not",
    run: () => eq(peaks(new Float32Array(101), 10).length, 10, "buckets"),
  },
  {
    name: "a loud bucket is loud at every resolution",
    run: () => {
      const busy = new Float32Array(44100).fill(0.5);
      return expect(peaks(busy, 4).every((bucket) => bucket.max === 0.5), "quiet bucket");
    },
  },
  {
    name: "the average reports the same value for both resolutions",
    run: () => {
      const busy = new Float32Array(44100).fill(0.5);
      return near(averaged(busy, 4)[0] ?? 0, 0.5, 1e-6, "mean");
    },
  },
];

export function main(): number {
  const bucket = 50;
  console.log(`average of bucket ${bucket}   ${(averaged(CLICK, 100)[bucket] ?? 0).toFixed(4)}`);
  console.log(`peak of bucket ${bucket}      ${(peaks(CLICK, 100)[bucket]?.max ?? 0).toFixed(4)}`);
  console.log("");
  console.log("one is the picture the user needs, the other is the picture that hides the problem");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
