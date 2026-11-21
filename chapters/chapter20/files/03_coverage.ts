/**
 * Example 3 - coverage, with a chapter removed.
 *
 *   node chapters/chapter20/files/03_coverage.ts
 */

import { CLAIMS } from "./claims.ts";
import { coverage } from "./ledger.ts";

export function main(): number {
  const full = coverage();
  const partial = coverage(CLAIMS.filter((claim) => claim.chapter !== 7));

  console.log(`full              ${full.chaptersWithClaims} of ${full.chapters}, missing ${full.missing.length}`);
  console.log(`without chapter 7 ${partial.chaptersWithClaims} of ${partial.chapters}, missing ${partial.missing.join(",")}`);
  console.log("");
  console.log("a ledger that only checks what it has cannot see a chapter that is not there");

  return full.missing.length === 0 && partial.missing.join(",") === "7" ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
