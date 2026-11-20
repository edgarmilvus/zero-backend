/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * A buffer of samples as a value: RMS, peak, and a slice, with no ownership. That is what lets the
 * capstone meter a recording on a machine with no audio device.
 */

import { expect, eq, type Check } from "./selfcheck.ts";

export type Samples = {
  readonly rate: number;
  readonly data: Float32Array;
};

export function newSamples(rate: number, data: Float32Array): Samples {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`rate: expected a positive number, got ${rate}`);
  return { rate, data };
}

export function at(samples: Samples, index: number): number {
  const value = samples.data[index];
  if (value === undefined) throw new Error(`no sample at ${index} of ${samples.data.length}`);
  return value;
}

export function rms(samples: Samples): number {
  if (samples.data.length === 0) return 0;
  let sum = 0;
  for (const sample of samples.data) sum += sample * sample;
  return Math.sqrt(sum / samples.data.length);
}

export function peakOf(samples: Samples): number {
  let peak = 0;
  for (const sample of samples.data) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

export function slice(samples: Samples, from: number, to: number): Samples {
  if (from < 0 || to > samples.data.length || from > to) {
    throw new Error(`slice: ${from}..${to} is outside 0..${samples.data.length}`);
  }
  return { rate: samples.rate, data: samples.data.slice(from, to) };
}

// --- the tests this file owns -------------------------------------------------

const HALF = newSamples(8000, new Float32Array(800).fill(0.5));

export const checks: readonly Check[] = [
  {
    name: "a sample set keeps its rate",
    run: () => eq(HALF.rate, 8000, "rate"),
  },
  {
    name: "the RMS of a constant is the constant",
    run: () => eq(rms(HALF), 0.5, "rms"),
  },
  {
    name: "the peak of a constant is its magnitude",
    run: () => eq(peakOf(HALF), 0.5, "peak"),
  },
  {
    name: "a slice keeps the rate and shortens the data",
    run: () => {
      const cut = slice(HALF, 100, 200);
      eq(cut.rate, 8000, "rate");
      return eq(cut.data.length, 100, "length");
    },
  },
  {
    name: "reading past the end throws with the index",
    run: () => {
      try {
        at(HALF, 999);
        return false;
      } catch (error) {
        return expect((error as Error).message.includes("999"), "message");
      }
    },
  },
];
