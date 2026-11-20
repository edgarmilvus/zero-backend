/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * Reads a record, asks the core what is pending, and prints the numbers the ledger needs. It decides
 * nothing: the version arithmetic comes from the core and the counts from the schema.
 *
 *   node chapters/chapter09/files/exercises/ex5_db.ts <db.json>
 */

import { newVersion, pending } from "./schema_core.ts";
import { normalize, readDb } from "./db_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_db.ts <db.json>");
    return 2;
  }

  let record;
  try {
    record = readDb(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const steps = pending(newVersion(0, record.version));

  console.log(`engine           ${record.engine}`);
  console.log(`version          ${record.version}, ${steps.length} migration(s) from empty`);
  console.log(`inserted         ${record.inserted} rows, ${numbers.keptShare.toFixed(2)} kept`);
  console.log(`load             ${record.loadMs} ms, ${numbers.perRowMs.toFixed(2)} ms per insert`);
  console.log(`persisted        ${record.persisted}`);

  if (record.persisted === "memory") {
    console.log("");
    console.log("a memory database survives this session and nothing else");
  }

  return numbers.keptShare === 1 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
