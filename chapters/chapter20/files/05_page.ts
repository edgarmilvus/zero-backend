/**
 * Example 5 - the ledger as data for the page.
 *
 *   node chapters/chapter20/files/05_page.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CLAIMS } from "./claims.ts";
import { ROOT, coverage, verify } from "./ledger.ts";

export function main(): number {
  const rows = CLAIMS.map((claim) => {
    const result = verify(claim);
    return {
      chapter: claim.chapter,
      id: claim.id,
      statement: claim.statement,
      evidence: claim.evidence,
      ok: result.ok,
      ...(result.ok && result.value !== undefined ? { value: result.value } : {}),
    };
  });
  const value = coverage();

  const out = join(ROOT, "chapters", "chapter20", "files", "browser", "ledger.json");
  mkdirSync(join(ROOT, "chapters", "chapter20", "files", "browser"), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ chapters: value.chapters, rows }, null, 2)}\n`);

  console.log(`rows              ${rows.length}`);
  console.log(`written           chapters/chapter20/files/browser/ledger.json`);
  return rows.every((row) => row.ok) ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
