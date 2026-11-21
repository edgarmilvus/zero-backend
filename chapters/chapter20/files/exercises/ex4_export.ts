/**
 * Exercise 4 - the ledger that exported itself.
 *
 * An export that parses the last table is an export that reads its own output: a drifted row stays
 * drifted, and a removed claim is never noticed. The table is derived from the claims every time.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Claim = { readonly id: string; readonly ok: boolean };
export type Row = { readonly id: string; readonly verdict: string };

export const TABLE = "c01 ok\nc02 ok";

/** The bug: parse the previous table. */
export function fromTable(table: string): Row[] {
  return table.split("\n").filter(Boolean).map((line) => {
    const [id, verdict] = line.split(" ");
    return { id: id ?? "", verdict: verdict ?? "" };
  });
}

/** The repair: derive the rows from the claims. */
export function fromClaims(claims: readonly Claim[]): Row[] {
  return claims.map((claim) => ({ id: claim.id, verdict: claim.ok ? "ok" : "FAILED" }));
}

export const checks: readonly Check[] = [
  { name: "the table parses into rows", run: () => eq(fromTable(TABLE).length, 2, "rows") },
  { name: "the claims derive the same rows", run: () => eq(fromClaims([{ id: "c01", ok: true }, { id: "c02", ok: true }]).length, 2, "rows") },
  { name: "a removed claim disappears from the derivation", run: () => eq(fromClaims([{ id: "c01", ok: true }]).length, 1, "rows") },
  { name: "but stays in the parsed table", run: () => eq(fromTable(TABLE).length, 2, "rows") },
  { name: "a failed claim derives FAILED", run: () => eq(fromClaims([{ id: "c01", ok: false }])[0]?.verdict, "FAILED", "verdict") },
  { name: "a malformed table line becomes an empty row", run: () => eq(fromTable("c01").length, 1, "rows") },
  { name: "the derivation is ordered by the claims", run: () => eq(fromClaims([{ id: "b", ok: true }, { id: "a", ok: true }]).map((row) => row.id).join(","), "b,a", "order") },
  { name: "the parsed table cannot see a new claim", run: () => expect(fromTable(TABLE).every((row) => row.id !== "c03"), "saw it") },
  { name: "the derivation cannot miss one", run: () => eq(fromClaims([{ id: "c01", ok: true }, { id: "c02", ok: true }, { id: "c03", ok: true }]).length, 3, "rows") },
];

export function main(): number {
  console.log(`from table        ${fromTable(TABLE).length} rows`);
  console.log(`from claims       ${fromClaims([{ id: "c01", ok: true }, { id: "c02", ok: true }, { id: "c03", ok: false }]).length} rows`);
  console.log("");
  console.log("an export derives its table; it does not parse the last one");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
