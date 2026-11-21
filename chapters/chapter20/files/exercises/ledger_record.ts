/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type LedgerRecord = {
  readonly claims: number;
  readonly chapters: number;
  readonly missing: number;
  readonly verdict: "complete" | "incomplete";
};

export function validateLedger(raw: unknown): LedgerRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("ledger: expected an object");
  const root = raw as Record<string, unknown>;
  const count = (value: unknown, path: string, min = 0): number => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
      throw new Error(`${path}: expected an integer >= ${min}`);
    }
    return value;
  };

  const record: LedgerRecord = {
    claims: count(root.claims, "ledger.claims", 1),
    chapters: count(root.chapters, "ledger.chapters", 1),
    missing: count(root.missing, "ledger.missing", 0),
    verdict: root.verdict === "complete" ? "complete" : root.verdict === "incomplete" ? "incomplete" : ("?" as never),
  };

  if (record.verdict !== "complete" && record.verdict !== "incomplete") {
    throw new Error(`ledger.verdict: expected complete or incomplete, got ${String(root.verdict)}`);
  }
  if (record.claims > record.chapters * 2) throw new Error(`ledger.claims: ${record.claims} for ${record.chapters} chapters is not one each`);
  if (record.verdict === "complete" && record.missing > 0) {
    throw new Error(`ledger.verdict: complete with ${record.missing} missing`);
  }

  return record;
}

export function readLedger(path: string): LedgerRecord {
  return validateLedger(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: LedgerRecord): { claimsPerChapter: number; complete: boolean } {
  return { claimsPerChapter: record.claims / record.chapters, complete: record.verdict === "complete" };
}

export const GOOD = { claims: 20, chapters: 20, missing: 0, verdict: "complete" };

function mutate(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  { name: "a complete ledger is accepted", run: () => eq(validateLedger(GOOD).claims, 20, "claims") },
  { name: "a complete verdict with a gap is refused", run: () => {
    const error = throws(() => validateLedger(mutate((c) => (c.missing = 1))), "gap");
    return expect(error.message.includes("complete with"), error.message);
  } },
  { name: "more than two claims per chapter is refused", run: () => {
    const error = throws(() => validateLedger(mutate((c) => (c.claims = 50))), "dense");
    return expect(error.message.includes("one each"), error.message);
  } },
  { name: "an unknown verdict is refused", run: () => {
    const error = throws(() => validateLedger(mutate((c) => (c.verdict = "maybe"))), "verdict");
    return expect(error.message.includes("complete or incomplete"), error.message);
  } },
  { name: "zero chapters is refused", run: () => {
    const error = throws(() => validateLedger(mutate((c) => (c.chapters = 0))), "chapters");
    return expect(error.message.includes(">= 1"), error.message);
  } },
  { name: "normalize derives the density and the verdict", run: () => eq(Object.keys(normalize(validateLedger(GOOD))).join(","), "claimsPerChapter,complete", "keys") },
];
