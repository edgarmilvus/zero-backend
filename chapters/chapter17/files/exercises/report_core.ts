/**
 * Exercise 5, file 1 of 3 - the pure part.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Report = {
  readonly build: string;
  readonly notes: number;
  readonly tombstones: number;
};

export function counts(notes: readonly { deleted?: boolean }[]): { notes: number; tombstones: number } {
  const tombstones = notes.filter((note) => note.deleted === true).length;
  return { notes: notes.length - tombstones, tombstones };
}

export function requireCount(value: number, path: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${path}: ${value} is not a count`);
  return value;
}

export function build(buildId: string, notes: readonly { deleted?: boolean }[]): Report {
  if (buildId.trim() === "") throw new Error("report: a build id is required");
  const value = counts(notes);
  return { build: buildId.trim(), notes: requireCount(value.notes, "report.notes"), tombstones: requireCount(value.tombstones, "report.tombstones") };
}

export const checks: readonly Check[] = [
  { name: "counts split live and tombstones", run: () => eq(counts([{}, { deleted: true }, {}]).notes, 2, "notes") },
  { name: "a tombstone is counted once", run: () => eq(counts([{ deleted: true }]).tombstones, 1, "tombstones") },
  { name: "an empty document is zero and zero", run: () => eq(counts([]).notes + counts([]).tombstones, 0, "empty") },
  { name: "a build without an id is refused", run: () => {
    const error = throws(() => build("  ", []), "build");
    return expect(error.message.includes("build id"), error.message);
  } },
  { name: "a negative count is refused", run: () => {
    const error = throws(() => requireCount(-1, "report.notes"), "negative");
    return expect(error.message.includes("count"), error.message);
  } },
];
