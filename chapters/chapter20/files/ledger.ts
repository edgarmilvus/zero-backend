/**
 * The ledger: read the claim's evidence, check the field if the claim names one, and count the coverage.
 *
 * Paths are resolved against the repository root and never against the working directory, because the
 * book is cloned somewhere else by everyone who reads it.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Claim } from "./claims.ts";
import { CLAIMS } from "./claims.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = normalize(join(HERE, "..", "..", ".."));

export type Verdict =
  | { readonly ok: true; readonly claim: Claim; readonly value?: number }
  | { readonly ok: false; readonly claim: Claim; readonly reason: string };

export function resolve(path: string): string {
  const target = normalize(join(ROOT, path));
  if (!target.startsWith(ROOT + sep)) throw new Error(`path: ${path} escapes the repository`);
  return target;
}

function readValue(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const key of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function verify(claim: Claim): Verdict {
  let text: string;
  try {
    const target = resolve(claim.evidence);
    if (!existsSync(target)) return { ok: false, claim, reason: `missing: ${claim.evidence}` };
    text = readFileSync(target, "utf8");
  } catch (error) {
    return { ok: false, claim, reason: (error as Error).message };
  }

  let record: unknown;
  if (claim.evidence.endsWith(".json") || claim.field !== undefined) {
    try {
      record = JSON.parse(text);
    } catch {
      return { ok: false, claim, reason: `not JSON: ${claim.evidence}` };
    }
    if (typeof record === "object" && record !== null && "chapter" in record) {
      const chapter = (record as { chapter?: unknown }).chapter;
      if (chapter !== claim.chapter) return { ok: false, claim, reason: `chapter ${String(chapter)} in ${claim.evidence}` };
    }
  }

  if (claim.field !== undefined) {
    const value = readValue(record, claim.field);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, claim, reason: `${claim.field} is not a number` };
    }
    if (claim.min !== undefined && value < claim.min) {
      return { ok: false, claim, reason: `${claim.field} ${value} is under ${claim.min}` };
    }
    return { ok: true, claim, value };
  }

  return { ok: true, claim };
}

export type Coverage = {
  readonly chapters: number;
  readonly chaptersWithClaims: number;
  readonly missing: readonly number[];
  readonly verified: number;
  readonly failed: readonly Verdict[];
};

export function coverage(claims: readonly Claim[] = CLAIMS, chapters = 20): Coverage {
  const present = new Set(claims.map((claim) => claim.chapter));
  const missing: number[] = [];
  for (let chapter = 1; chapter <= chapters; chapter += 1) if (!present.has(chapter)) missing.push(chapter);

  const results = claims.map(verify);
  return {
    chapters,
    chaptersWithClaims: present.size,
    missing,
    verified: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok),
  };
}

export function assertComplete(value: Coverage): void {
  if (value.missing.length > 0) throw new Error(`coverage: chapters ${value.missing.join(",")} have no claim`);
  if (value.failed.length > 0) throw new Error(`coverage: ${value.failed.length} claim(s) failed their evidence`);
}
