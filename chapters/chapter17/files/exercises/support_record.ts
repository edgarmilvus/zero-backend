/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type SupportRecord = {
  readonly build: string;
  readonly notes: number;
  readonly bytes: number;
  readonly category: string;
  readonly clean: boolean;
};

export function validateSupport(raw: unknown): SupportRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("support: expected an object");
  const root = raw as Record<string, unknown>;

  if (typeof root.build !== "string" || root.build.trim() === "") throw new Error("support.build: required");
  if (typeof root.notes !== "number" || !Number.isInteger(root.notes) || root.notes < 0) {
    throw new Error("support.notes: expected a non-negative integer");
  }
  if (typeof root.bytes !== "number" || !Number.isInteger(root.bytes) || root.bytes <= 0) {
    throw new Error("support.bytes: expected a positive integer");
  }
  if (typeof root.category !== "string" || root.category.trim() === "") throw new Error("support.category: required");
  if (root.clean !== true) throw new Error("support.clean: the bundle contains note text and is not sendable");

  return { build: root.build, notes: root.notes, bytes: root.bytes, category: root.category, clean: true };
}

export function readSupport(path: string): SupportRecord {
  return validateSupport(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: SupportRecord): { bytesPerNote: number; sendable: boolean } {
  return { bytesPerNote: record.notes === 0 ? record.bytes : record.bytes / record.notes, sendable: record.clean };
}

export const GOOD = { build: "1.4.0", notes: 3, bytes: 1_290, category: "unknown", clean: true };

function mutate(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  { name: "a clean record is accepted", run: () => eq(validateSupport(GOOD).notes, 3, "notes") },
  { name: "an unclean bundle is refused", run: () => {
    const error = throws(() => validateSupport(mutate((c) => (c.clean = false))), "dirty");
    return expect(error.message.includes("not sendable"), error.message);
  } },
  { name: "a missing build is refused", run: () => {
    const error = throws(() => validateSupport(mutate((c) => (c.build = ""))), "build");
    return expect(error.message.includes("build"), error.message);
  } },
  { name: "zero bytes is refused", run: () => {
    const error = throws(() => validateSupport(mutate((c) => (c.bytes = 0))), "bytes");
    return expect(error.message.includes("positive"), error.message);
  } },
  { name: "a negative note count is refused", run: () => {
    const error = throws(() => validateSupport(mutate((c) => (c.notes = -1))), "notes");
    return expect(error.message.includes("non-negative"), error.message);
  } },
  { name: "normalize derives the size and the verdict", run: () => eq(Object.keys(normalize(validateSupport(GOOD))).sort().join(","), "bytesPerNote,sendable", "keys") },
];
