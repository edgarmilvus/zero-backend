/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * Reads an index record and prints what the ledger needs: the model, the dimensions, the bytes, the
 * per-query cost and the recall. It computes nothing the other two files already know.
 *
 *   node chapters/chapter11/files/exercises/ex5_index.ts <index.json>
 */

import { normalizeRecord, readIndex } from "./index_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_index.ts <index.json>");
    return 2;
  }

  let record;
  try {
    record = readIndex(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalizeRecord(record);

  console.log(`model            ${record.model}`);
  console.log(`dimensions       ${record.dims}`);
  console.log(`vectors          ${record.vectors}`);
  console.log(`bytes            ${numbers.kilobytes.toFixed(0)} kB (${record.bytesPerVector} per value)`);
  console.log(`per query        ${numbers.bytesPerQuery} bytes before the search`);
  console.log(`recall           ${(record.recall * 100).toFixed(0)} per cent of the exact top five`);

  if (record.recall < 0.9) {
    console.log("");
    console.log("a recall under ninety per cent is a representation to reconsider, not to ship");
  }

  return record.recall >= 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
