/**
 * Example 4 - which chapters can this machine run, as written?
 *
 *   node chapters/chapter02/files/04_which_chapters_run.ts
 *
 * The answer is a matrix, not a yes. A chapter needs a capability, a capability has a
 * fallback, and the fallback costs something the ledger of chapter 1 can price. This prints
 * the matrix the book's later chapters are allowed to assume.
 */

import { detectCapabilities } from "./detect.ts";
import { chaptersThatRun, probe } from "./probe.ts";

export function main(): number {
  const profile = probe(detectCapabilities());
  const matrix = chaptersThatRun(profile);

  console.log(`tier reached ${profile.tier} of 3`);
  console.log("");
  console.log(`${"chapter".padEnd(9)}${"as written".padEnd(12)}missing`);
  console.log(`${"-".repeat(9)}${"-".repeat(12)}-------`);

  for (const row of matrix) {
    console.log(
      `${String(row.chapter).padEnd(9)}${(row.ok ? "runs" : "degrades").padEnd(12)}${
        row.missing.length === 0 ? "" : row.missing.join(", ")
      }`,
    );
  }

  const degraded = matrix.filter((row) => !row.ok);
  console.log("");
  if (degraded.length === 0) {
    console.log("every chapter in the book runs as written on this machine");
    return 0;
  }
  console.log(`${degraded.length} chapters take a fallback here, and each one is priced later`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
