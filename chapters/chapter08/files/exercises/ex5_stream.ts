/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * Reads a record, prints the plan it describes, and refuses one whose numbers do not agree. It decides
 * nothing: the ranges come from the core and the arithmetic from the schema.
 *
 *   node chapters/chapter08/files/exercises/ex5_stream.ts <stream.json>
 */

import { lengthOf, split } from "./range_core.ts";
import { normalize, readStream } from "./stream_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_stream.ts <stream.json>");
    return 2;
  }

  let record;
  try {
    record = readStream(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const ranges = split(record.sizeBytes, record.chunkBytes);
  const covered = ranges.reduce((sum, range) => sum + lengthOf(range), 0);

  console.log(`file             ${record.path}`);
  console.log(`size             ${record.sizeBytes} bytes`);
  console.log(`chunks           ${record.chunks} of ${record.chunkBytes} bytes`);
  console.log(`covered by plan  ${covered} bytes in ${ranges.length} ranges`);
  console.log(`peak             ${record.peakBytes} bytes`);
  console.log(`digest           ${numbers.digestPrefix}...`);

  if (covered !== record.sizeBytes || ranges.length !== record.chunks) {
    console.error("refused: the record and the plan disagree about the file");
    return 1;
  }

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
