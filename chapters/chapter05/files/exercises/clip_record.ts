/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * A clip record says how many frames were encoded, how many were keyframes, and what the file
 * weighs. Reading it is easy; refusing one whose timestamps and frame count disagree is the work,
 * and the refusal names the field.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type ClipRecord = {
  readonly codec: string;
  readonly frames: number;
  readonly keyframes: number;
  readonly keyEvery: number;
  readonly fps: number;
  readonly bytes: number;
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

export function validateClip(raw: unknown): ClipRecord {
  const root = bag(raw, "clip");

  if (typeof root.codec !== "string" || root.codec === "") {
    throw new Error("clip.codec: expected a non-empty string");
  }

  const record: ClipRecord = {
    codec: root.codec,
    frames: positive(root.frames, "clip.frames"),
    keyframes: positive(root.keyframes, "clip.keyframes"),
    keyEvery: positive(root.keyEvery, "clip.keyEvery"),
    fps: positive(root.fps, "clip.fps"),
    bytes: positive(root.bytes, "clip.bytes"),
  };

  if (record.keyframes > record.frames) {
    throw new Error(
      `clip.keyframes: ${record.keyframes} keyframes in ${record.frames} frames is impossible`,
    );
  }

  const expected = Math.ceil(record.frames / record.keyEvery);
  if (record.keyframes !== expected) {
    throw new Error(
      `clip.keyframes: an interval of ${record.keyEvery} over ${record.frames} frames is ${expected}, not ${record.keyframes}`,
    );
  }

  return record;
}

/** The only function here that touches the disk. */
export function readClip(path: string): ClipRecord {
  return validateClip(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: ClipRecord): {
  durationMs: number;
  bytesPerFrame: number;
  keyShare: number;
} {
  return {
    durationMs: Math.round((record.frames / record.fps) * 1000),
    bytesPerFrame: Math.round(record.bytes / record.frames),
    keyShare: record.keyframes / record.frames,
  };
}

// --- the tests this file owns -------------------------------------------------

export const GOOD = {
  codec: "vp09.00.10.08",
  frames: 60,
  keyframes: 5,
  keyEvery: 12,
  fps: 30,
  bytes: 18_000,
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete record is accepted",
    run: () => eq(validateClip(GOOD).codec, "vp09.00.10.08", "codec"),
  },
  {
    name: "a missing frame count is refused by name",
    run: () => {
      const error = throws(() => validateClip(mutate((c) => delete c.frames)), "no frames");
      return expect(error.message.includes("clip.frames"), error.message);
    },
  },
  {
    name: "a keyframe count larger than the frame count is refused",
    run: () => {
      const error = throws(() => validateClip(mutate((c) => (c.keyframes = 99))), "too many");
      return expect(error.message.includes("impossible"), error.message);
    },
  },
  {
    name: "a keyframe count that contradicts the interval is refused",
    run: () => {
      const error = throws(() => validateClip(mutate((c) => (c.keyframes = 4))), "mismatch");
      return expect(error.message.includes("is 5, not 4"), error.message);
    },
  },
  {
    name: "an array is not a record",
    run: () => {
      const error = throws(() => validateClip([]), "array");
      return expect(error.message.includes("expected an object"), error.message);
    },
  },
  {
    name: "normalize derives the duration, the size per frame and the key share",
    run: () =>
      eq(
        Object.keys(normalize(validateClip(GOOD))).join(","),
        "durationMs,bytesPerFrame,keyShare",
        "keys",
      ),
  },
];
