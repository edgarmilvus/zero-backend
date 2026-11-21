/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 *   node chapters/chapter17/files/exercises/ex5_support.ts <support.json>
 */

import { build } from "./report_core.ts";
import { normalize, readSupport } from "./support_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_support.ts <support.json>");
    return 2;
  }

  let record;
  try {
    record = readSupport(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const rebuilt = build(record.build, Array.from({ length: record.notes }, () => ({})));

  console.log(`build            ${record.build}`);
  console.log(`notes            ${record.notes}, rebuilt ${rebuilt.notes}`);
  console.log(`bytes            ${record.bytes}, ${numbers.bytesPerNote.toFixed(0)} per note`);
  console.log(`category         ${record.category}`);
  console.log(`sendable         ${numbers.sendable}`);

  return numbers.sendable ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
