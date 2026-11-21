/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 *   node chapters/chapter18/files/exercises/ex5_pool.ts <pool.json>
 */

import { depth } from "./pool_core.ts";
import { normalize, readPool } from "./pool_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_pool.ts <pool.json>");
    return 2;
  }

  let record;
  try {
    record = readPool(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const shape = depth(record.tasks, record.workers);

  console.log(`workers          ${record.workers}`);
  console.log(`tasks            ${record.tasks}, ${numbers.tasksPerWorker.toFixed(1)} per worker`);
  console.log(`queue at start   ${shape.queued}, running ${shape.running}`);
  console.log(`frame            ${record.longestFrameMs} ms of ${record.budgetMs}, ${(numbers.frameShare * 100).toFixed(0)} per cent`);
  console.log(`queue at end     ${record.queuedAtEnd}`);

  return record.queuedAtEnd === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
