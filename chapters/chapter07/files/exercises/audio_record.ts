/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * A recording record says the rate, the duration, the loudness and how much silence was cut. Reading
 * it is easy; refusing one whose numbers contradict each other is the work.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type AudioRecord = {
  readonly name: string;
  readonly sampleRate: number;
  readonly seconds: number;
  readonly loudnessLufs: number;
  readonly cutSeconds: number;
  readonly peakDbfs: number;
};

type Bag = Record<string, unknown>;

function bag(value: unknown, path: string): Bag {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Bag;
}

function positive(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path}: expected a positive number`);
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}: expected a finite number`);
  }
  return value;
}

export function validateAudio(raw: unknown): AudioRecord {
  const root = bag(raw, "audio");

  if (typeof root.name !== "string" || root.name === "") {
    throw new Error("audio.name: expected a non-empty string");
  }

  const record: AudioRecord = {
    name: root.name,
    sampleRate: positive(root.sampleRate, "audio.sampleRate"),
    seconds: positive(root.seconds, "audio.seconds"),
    loudnessLufs: finite(root.loudnessLufs, "audio.loudnessLufs"),
    cutSeconds: finite(root.cutSeconds, "audio.cutSeconds"),
    peakDbfs: finite(root.peakDbfs, "audio.peakDbfs"),
  };

  if (record.cutSeconds >= record.seconds + record.cutSeconds) {
    throw new Error("audio.cutSeconds: more was cut than the file contained");
  }
  if (record.peakDbfs > 0) {
    throw new Error(`audio.peakDbfs: ${record.peakDbfs} is above full scale`);
  }
  if (record.loudnessLufs < record.peakDbfs - 40) {
    throw new Error("audio.loudnessLufs: more than forty units under the peak, which no signal produces");
  }

  return record;
}

/** The only function here that touches the disk. */
export function readAudio(path: string): AudioRecord {
  return validateAudio(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: AudioRecord): {
  keptSeconds: number;
  cutShare: number;
  headroom: number;
} {
  const keptSeconds = record.seconds;
  return {
    keptSeconds,
    cutShare: record.cutSeconds / (keptSeconds + record.cutSeconds),
    headroom: -record.peakDbfs,
  };
}

// --- the tests this file owns -------------------------------------------------

export const GOOD = {
  name: "voice.wav",
  sampleRate: 44100,
  seconds: 1.2,
  loudnessLufs: -10.83,
  cutSeconds: 1.8,
  peakDbfs: -6.02,
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete record is accepted",
    run: () => eq(validateAudio(GOOD).sampleRate, 44100, "rate"),
  },
  {
    name: "a missing duration is refused by name",
    run: () => {
      const error = throws(() => validateAudio(mutate((c) => delete c.seconds)), "no duration");
      return expect(error.message.includes("audio.seconds"), error.message);
    },
  },
  {
    name: "a peak above full scale is refused",
    run: () => {
      const error = throws(() => validateAudio(mutate((c) => (c.peakDbfs = 3))), "peak");
      return expect(error.message.includes("above full scale"), error.message);
    },
  },
  {
    name: "a loudness far under the peak is refused",
    run: () => {
      const error = throws(() => validateAudio(mutate((c) => (c.loudnessLufs = -90))), "loudness");
      return expect(error.message.includes("forty units"), error.message);
    },
  },
  {
    name: "a zero sample rate is refused",
    run: () => {
      const error = throws(() => validateAudio(mutate((c) => (c.sampleRate = 0))), "rate");
      return expect(error.message.includes("positive"), error.message);
    },
  },
  {
    name: "normalize derives the cut share and the headroom",
    run: () =>
      eq(
        Object.keys(normalize(validateAudio(GOOD))).join(","),
        "keptSeconds,cutShare,headroom",
        "keys",
      ),
  },
];
