/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * Reads a query record, asks the core what the plan costs, and prints the numbers the ledger needs.
 * It decides nothing: the byte arithmetic comes from the core and the validation from the schema.
 *
 *   node chapters/chapter10/files/exercises/ex5_analytics.ts <query.json>
 */

import { newPlan, scanMs } from "./plan_core.ts";
import { normalize, readQuery } from "./query_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_analytics.ts <query.json>");
    return 2;
  }

  let record;
  try {
    record = readQuery(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const plan = newPlan(record.rows, Array.from({ length: record.columnsRead }, (_, index) => `c${index}`), 4);
  const predicted = scanMs(plan, 1000);

  console.log(`query            ${record.query}`);
  console.log(`format           ${record.format}`);
  console.log(`rows             ${record.rows} in ${record.ms.toFixed(0)} ms`);
  console.log(`columns read     ${record.columnsRead}`);
  console.log(`bytes            ${numbers.megabytes.toFixed(2)} MB at ${numbers.mbPerSecond.toFixed(0)} MB/s`);
  console.log(`per row          ${numbers.msPerRow.toFixed(3)} ms`);
  console.log(`plan at 1 GB/s   ${predicted.toFixed(1)} ms (a floor, not a promise)`);

  if (record.bytes < record.fileBytes) {
    console.log("");
    console.log(`the query read ${((record.bytes / record.fileBytes) * 100).toFixed(0)} per cent of the file`);
  }

  return record.rows > 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
