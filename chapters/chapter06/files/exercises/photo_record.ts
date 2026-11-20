/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * A photo record says what went in, what came out, in which format, and whether the metadata is
 * gone. Reading it is easy; refusing one that contradicts itself is the work, and the refusal names
 * the field.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type PhotoRecord = {
  readonly name: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly format: string;
  readonly metadataBefore: number;
  readonly metadataAfter: number;
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

function zeroOrMore(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path}: expected zero or a positive number`);
  }
  return value;
}

export function validatePhoto(raw: unknown): PhotoRecord {
  const root = bag(raw, "photo");

  if (typeof root.name !== "string" || root.name === "") {
    throw new Error("photo.name: expected a non-empty string");
  }
  if (typeof root.format !== "string" || !root.format.startsWith("image/")) {
    throw new Error("photo.format: expected a media type such as image/webp");
  }

  const record: PhotoRecord = {
    name: root.name,
    inputBytes: positive(root.inputBytes, "photo.inputBytes"),
    outputBytes: positive(root.outputBytes, "photo.outputBytes"),
    format: root.format,
    metadataBefore: zeroOrMore(root.metadataBefore, "photo.metadataBefore"),
    metadataAfter: zeroOrMore(root.metadataAfter, "photo.metadataAfter"),
  };

  if (record.outputBytes > record.inputBytes) {
    throw new Error(
      `photo.outputBytes: ${record.outputBytes} is larger than the input ${record.inputBytes}, so this is not a resize`,
    );
  }
  if (record.metadataAfter > record.metadataBefore) {
    throw new Error("photo.metadataAfter: more segments after the strip than before it");
  }

  return record;
}

/** The only function here that touches the disk. */
export function readPhoto(path: string): PhotoRecord {
  return validatePhoto(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: PhotoRecord): {
  ratio: number;
  savedBytes: number;
  metadataRemoved: number;
} {
  return {
    ratio: record.inputBytes / record.outputBytes,
    savedBytes: record.inputBytes - record.outputBytes,
    metadataRemoved: record.metadataBefore - record.metadataAfter,
  };
}

// --- the tests this file owns -------------------------------------------------

export const GOOD = {
  name: "IMG_0001.heic",
  inputBytes: 3_400_000,
  outputBytes: 240_000,
  format: "image/webp",
  metadataBefore: 1,
  metadataAfter: 0,
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete record is accepted",
    run: () => eq(validatePhoto(GOOD).format, "image/webp", "format"),
  },
  {
    name: "a missing input size is refused by name",
    run: () => {
      const error = throws(() => validatePhoto(mutate((c) => delete c.inputBytes)), "no size");
      return expect(error.message.includes("photo.inputBytes"), error.message);
    },
  },
  {
    name: "a format that is not a media type is refused",
    run: () => {
      const error = throws(() => validatePhoto(mutate((c) => (c.format = "webp"))), "format");
      return expect(error.message.includes("media type"), error.message);
    },
  },
  {
    name: "an output larger than the input is refused",
    run: () => {
      const error = throws(() => validatePhoto(mutate((c) => (c.outputBytes = 9_000_000))), "bigger");
      return expect(error.message.includes("not a resize"), error.message);
    },
  },
  {
    name: "metadata that grew after the strip is refused",
    run: () => {
      const error = throws(() => validatePhoto(mutate((c) => (c.metadataAfter = 3))), "grew");
      return expect(error.message.includes("more segments"), error.message);
    },
  },
  {
    name: "normalize derives the ratio, the saving and the strip",
    run: () =>
      eq(
        Object.keys(normalize(validatePhoto(GOOD))).join(","),
        "ratio,savedBytes,metadataRemoved",
        "keys",
      ),
  },
];
