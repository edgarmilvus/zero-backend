/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * A sync record says how many replicas met, how many operations they had, how many bytes moved and
 * whether they converged. A record that says converged: false is not a record of a sync, it is a bug
 * report, and the validator refuses it as a success.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type SyncRecord = {
  readonly replicas: number;
  readonly operations: number;
  readonly bytes: number;
  readonly conflicts: number;
  readonly converged: boolean;
};

export function validateSync(raw: unknown): SyncRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("sync: expected an object");
  const root = raw as Record<string, unknown>;
  const count = (value: unknown, path: string): number => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`${path}: expected a non-negative integer`);
    }
    return value;
  };

  const record: SyncRecord = {
    replicas: count(root.replicas, "sync.replicas"),
    operations: count(root.operations, "sync.operations"),
    bytes: count(root.bytes, "sync.bytes"),
    conflicts: count(root.conflicts, "sync.conflicts"),
    converged: root.converged === true,
  };

  if (record.replicas < 2) throw new Error(`sync.replicas: ${record.replicas}, a merge needs two`);
  if (record.operations === 0) throw new Error("sync.operations: a sync with no operations measured nothing");
  if (record.bytes === 0) throw new Error("sync.bytes: a sync that moved no bytes did not happen");
  if (!record.converged) throw new Error("sync.converged: the replicas disagree, so the sync failed");

  return record;
}

export function readSync(path: string): SyncRecord {
  return validateSync(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: SyncRecord): { bytesPerOperation: number; conflictsPerReplica: number } {
  return {
    bytesPerOperation: record.bytes / record.operations,
    conflictsPerReplica: record.conflicts / record.replicas,
  };
}

export const GOOD = { replicas: 2, operations: 3, bytes: 1800, conflicts: 0, converged: true };

function mutate(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  { name: "a complete record is accepted", run: () => eq(validateSync(GOOD).replicas, 2, "replicas") },
  { name: "a record that did not converge is refused", run: () => {
    const error = throws(() => validateSync(mutate((copy) => (copy.converged = false))), "converged");
    return expect(error.message.includes("disagree"), error.message);
  } },
  { name: "a single replica is not a merge", run: () => {
    const error = throws(() => validateSync(mutate((copy) => (copy.replicas = 1))), "one");
    return expect(error.message.includes("two"), error.message);
  } },
  { name: "zero operations measured nothing", run: () => {
    const error = throws(() => validateSync(mutate((copy) => (copy.operations = 0))), "ops");
    return expect(error.message.includes("nothing"), error.message);
  } },
  { name: "zero bytes did not happen", run: () => {
    const error = throws(() => validateSync(mutate((copy) => (copy.bytes = 0))), "bytes");
    return expect(error.message.includes("did not happen"), error.message);
  } },
  { name: "normalize derives bytes per operation and conflicts per replica", run: () => eq(Object.keys(normalize(validateSync(GOOD))).join(","), "bytesPerOperation,conflictsPerReplica", "keys") },
];
