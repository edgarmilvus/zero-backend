/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 *   node chapters/chapter13/files/exercises/ex5_sync.ts <sync.json>
 */

import { later } from "./merge_core.ts";
import { normalize, readSync } from "./sync_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_sync.ts <sync.json>");
    return 2;
  }

  let record;
  try {
    record = readSync(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const newest = later({ counter: record.operations, actor: "a" }, { counter: 1, actor: "b" });

  console.log(`replicas         ${record.replicas}`);
  console.log(`operations       ${record.operations}`);
  console.log(`bytes            ${(record.bytes / 1024).toFixed(1)} kB, ${numbers.bytesPerOperation.toFixed(0)} per operation`);
  console.log(`conflicts        ${record.conflicts}, ${numbers.conflictsPerReplica.toFixed(1)} per replica`);
  console.log(`converged        ${record.converged}, newest version ${newest.counter}:${newest.actor}`);

  return record.converged ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
