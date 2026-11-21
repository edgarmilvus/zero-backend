/**
 * Example 1 - the ledger, read.
 *
 *   node chapters/chapter20/files/01_ledger.ts
 *
 * Every claim is read against the repository: the file exists, the record's chapter matches, and the
 * number the claim names reaches its floor.
 */

import { CLAIMS } from "./claims.ts";
import { coverage, verify } from "./ledger.ts";
import { assertComplete, renderCoverage, renderTable } from "./report.ts";

export function main(): number {
  const results = CLAIMS.map(verify);
  const value = coverage();

  console.log(renderTable(CLAIMS, results));
  console.log("");
  console.log(renderCoverage(value));
  assertComplete(value);

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
