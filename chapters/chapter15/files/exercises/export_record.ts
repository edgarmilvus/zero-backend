/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type ExportRecord = {
  readonly notes: number;
  readonly bytes: number;
  readonly digest: string;
  readonly verdict: "verified" | "refused";
};

export function validateExport(raw: unknown): ExportRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("export: expected an object");
  const root = raw as Record<string, unknown>;

  if (typeof root.notes !== "number" || !Number.isInteger(root.notes) || root.notes <= 0) {
    throw new Error("export.notes: expected a positive integer");
  }
  if (typeof root.bytes !== "number" || !Number.isInteger(root.bytes) || root.bytes <= 0) {
    throw new Error("export.bytes: expected a positive integer");
  }
  if (typeof root.digest !== "string" || !/^[0-9a-f]{64}$/.test(root.digest)) {
    throw new Error("export.digest: expected 64 hex characters");
  }
  if (root.verdict !== "verified" && root.verdict !== "refused") {
    throw new Error(`export.verdict: expected verified or refused, got ${String(root.verdict)}`);
  }

  return { notes: root.notes, bytes: root.bytes, digest: root.digest, verdict: root.verdict };
}

export function readExport(path: string): ExportRecord {
  return validateExport(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: ExportRecord): { kBPerNote: number; readable: boolean } {
  return { kBPerNote: record.bytes / record.notes / 1024, readable: record.verdict === "verified" };
}

export const GOOD = {
  notes: 40,
  bytes: 11_900,
  digest: "a".repeat(64),
  verdict: "verified",
};

function mutate(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  { name: "a complete record is accepted", run: () => eq(validateExport(GOOD).notes, 40, "notes") },
  { name: "a short digest is refused", run: () => {
    const error = throws(() => validateExport(mutate((c) => (c.digest = "abc"))), "digest");
    return expect(error.message.includes("64 hex"), error.message);
  } },
  { name: "zero notes is refused", run: () => {
    const error = throws(() => validateExport(mutate((c) => (c.notes = 0))), "notes");
    return expect(error.message.includes("positive"), error.message);
  } },
  { name: "zero bytes is refused", run: () => {
    const error = throws(() => validateExport(mutate((c) => (c.bytes = 0))), "bytes");
    return expect(error.message.includes("positive"), error.message);
  } },
  { name: "an unknown verdict is refused", run: () => {
    const error = throws(() => validateExport(mutate((c) => (c.verdict = "maybe"))), "verdict");
    return expect(error.message.includes("verified or refused"), error.message);
  } },
  { name: "normalize derives kB per note and readability", run: () => eq(Object.keys(normalize(validateExport(GOOD))).join(","), "kBPerNote,readable", "keys") },
];
