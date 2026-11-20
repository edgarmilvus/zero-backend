/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 *   node chapters/chapter12/files/exercises/ex5_load.ts <load.json>
 */

import { downloadMs } from "./manifest_core.ts";
import { normalize, readLoad } from "./load_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_load.ts <load.json>");
    return 2;
  }

  let record;
  try {
    record = readLoad(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const bytes = 23_684_681;

  console.log(`mode             ${record.mode}`);
  console.log(`load             ${record.loadMs.toFixed(0)} ms, longest frame ${record.maxFrameGapMs.toFixed(0)} ms`);
  console.log(`embedding        ${record.embedMs.toFixed(0)} ms, ${numbers.queriesPerSecond.toFixed(1)} per second`);
  console.log(`download         ${(bytes / 1024 / 1024).toFixed(1)} MB, ${downloadMs({ bytes, mbps: 10, dims: record.dims }).toFixed(0)} ms at 10 Mbps`);
  console.log(`load share       ${(numbers.loadShare * 100).toFixed(0)} per cent of the first pair`);

  return record.mode === "worker" ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
