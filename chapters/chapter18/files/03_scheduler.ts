/**
 * Example 3 - the ratio that keeps the export moving.
 *
 *   node chapters/chapter18/files/03_scheduler.ts
 */

import { Scheduler } from "./scheduler.ts";

export function main(): number {
  const scheduler = new Scheduler(2, 3);
  const admitted: string[] = [];

  for (let index = 0; index < 2; index += 1) {
    const job = { id: `i${index}`, priority: "interactive" as const, run: async () => index };
    scheduler.admit(job);
    admitted.push(`i${index}`);
  }
  const deferred = scheduler.admit({
    id: "export",
    priority: "background",
    run: async () => "exported",
  });

  console.log(`interactive       ${admitted.length} admitted`);
  console.log(`background        admitted ${deferred.admitted} (${deferred.reason})`);
  console.log(`pending           ${scheduler.pending}`);
  console.log("");
  console.log("a background job waits for the interactive queue to empty, then runs");

  return deferred.admitted === false && scheduler.pending === 1 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
