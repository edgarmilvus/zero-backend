/**
 * Example 4 - the ledger as a table a person can paste.
 *
 *   node chapters/chapter20/files/04_export.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CLAIMS } from "./claims.ts";
import { ROOT, coverage, verify } from "./ledger.ts";
import { renderTable } from "./report.ts";

export function main(): number {
  const results = CLAIMS.map(verify);
  const table = renderTable(CLAIMS, results);
  const value = coverage();

  const out = join(ROOT, "runs", "chapter20", "ledger");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ledger.md"), `${table}\n`);

  console.log(table);
  console.log("");
  console.log(`written           runs/chapter20/ledger/ledger.md (${table.split("\n").length - 1} rows)`);
  console.log(`verified          ${value.verified} of ${CLAIMS.length}`);

  return value.verified === CLAIMS.length ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
