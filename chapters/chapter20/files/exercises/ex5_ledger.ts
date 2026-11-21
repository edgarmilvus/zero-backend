/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 *   node chapters/chapter20/files/exercises/ex5_ledger.ts <ledger.json>
 */

import { gaps } from "./claim_core.ts";
import { normalize, readLedger } from "./ledger_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_ledger.ts <ledger.json>");
    return 2;
  }

  let record;
  try {
    record = readLedger(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);

  console.log(`claims           ${record.claims}`);
  console.log(`chapters         ${record.chapters}, ${numbers.claimsPerChapter.toFixed(2)} per chapter`);
  console.log(`missing          ${record.missing}, gaps ${gaps([...Array(record.chapters).keys()].map((n) => n + 1), record.chapters).length}`);
  console.log(`verdict          ${record.verdict}`);
  console.log(`complete         ${numbers.complete}`);

  return numbers.complete ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
