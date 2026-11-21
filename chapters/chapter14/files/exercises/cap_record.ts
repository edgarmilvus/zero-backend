/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type CapRecord = {
  readonly issuer: string;
  readonly scope: readonly string[];
  readonly expiresAt: number;
  readonly nonce: string;
  readonly verdict: "allowed" | "refused";
};

export function validateCap(raw: unknown): CapRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("cap: expected an object");
  const root = raw as Record<string, unknown>;

  if (typeof root.issuer !== "string" || root.issuer.length < 40) {
    throw new Error("cap.issuer: expected a public key");
  }
  if (!Array.isArray(root.scope) || root.scope.length === 0 || !root.scope.every((pair) => typeof pair === "string")) {
    throw new Error("cap.scope: expected at least one pair");
  }
  if (typeof root.expiresAt !== "number" || !Number.isFinite(root.expiresAt)) {
    throw new Error("cap.expiresAt: expected epoch milliseconds");
  }
  if (typeof root.nonce !== "string" || root.nonce.length < 8) throw new Error("cap.nonce: expected at least 8 characters");
  if (root.verdict !== "allowed" && root.verdict !== "refused") {
    throw new Error(`cap.verdict: expected allowed or refused, got ${String(root.verdict)}`);
  }

  return {
    issuer: root.issuer,
    scope: root.scope as string[],
    expiresAt: root.expiresAt,
    nonce: root.nonce,
    verdict: root.verdict,
  };
}

export function readCap(path: string): CapRecord {
  return validateCap(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: CapRecord): { minutesLeft: number; pairs: number } {
  return { minutesLeft: Math.round((record.expiresAt - Date.now()) / 60_000), pairs: record.scope.length };
}

export const GOOD = {
  issuer: "A".repeat(88),
  scope: ["read:own"],
  expiresAt: Date.now() + 3_600_000,
  nonce: "0123456789abcdef",
  verdict: "allowed",
};

function mutate(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  { name: "a complete record is accepted", run: () => eq(validateCap(GOOD).verdict, "allowed", "verdict") },
  { name: "a short issuer is refused", run: () => {
    const error = throws(() => validateCap(mutate((c) => (c.issuer = "abc"))), "issuer");
    return expect(error.message.includes("public key"), error.message);
  } },
  { name: "an empty scope is refused", run: () => {
    const error = throws(() => validateCap(mutate((c) => (c.scope = []))), "scope");
    return expect(error.message.includes("at least one"), error.message);
  } },
  { name: "a text expiry is refused", run: () => {
    const error = throws(() => validateCap(mutate((c) => (c.expiresAt = "tomorrow"))), "expiry");
    return expect(error.message.includes("epoch"), error.message);
  } },
  { name: "a short nonce is refused", run: () => {
    const error = throws(() => validateCap(mutate((c) => (c.nonce = "abc"))), "nonce");
    return expect(error.message.includes("8"), error.message);
  } },
  { name: "normalize derives the minutes and the pairs", run: () => eq(Object.keys(normalize(validateCap(GOOD))).join(","), "minutesLeft,pairs", "keys") },
];
