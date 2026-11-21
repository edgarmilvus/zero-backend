/**
 * The table a reader checks, and the two assertions the ledger needs.
 */

import type { Claim } from "./claims.ts";
import type { Coverage, Verdict } from "./ledger.ts";

export function renderTable(claims: readonly Claim[], results: readonly Verdict[]): string {
  const lines = ["chapter  claim  evidence                                     verdict"];
  for (const [index, claim] of claims.entries()) {
    const result = results[index];
    const verdict = result?.ok ? (result.value === undefined ? "ok" : `ok (${result.value})`) : "FAILED";
    lines.push(`${String(claim.chapter).padStart(7)}  ${claim.id}    ${claim.evidence.padEnd(42)} ${verdict}`);
  }
  return lines.join("\n");
}

export function renderCoverage(value: Coverage): string {
  return [
    `chapters          ${value.chapters}`,
    `with a claim      ${value.chaptersWithClaims}`,
    `verified          ${value.verified}`,
    `missing           ${value.missing.length === 0 ? "none" : value.missing.join(", ")}`,
    `failed            ${value.failed.length}`,
  ].join("\n");
}

export function assertComplete(value: Coverage): void {
  if (value.missing.length > 0) throw new Error(`coverage: chapters ${value.missing.join(",")} have no claim`);
  if (value.failed.length > 0) throw new Error(`coverage: ${value.failed.length} claim(s) failed their evidence`);
}

export function assertVerdict(value: Verdict, ok: boolean): void {
  if (value.ok !== ok) {
    throw new Error(`${value.claim.id}: expected ${ok ? "verified" : "refused"}, got ${value.ok ? "verified" : value.reason}`);
  }
}
