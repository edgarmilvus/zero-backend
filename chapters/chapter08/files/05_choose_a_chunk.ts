/**
 * Example 5 - what a chunk size costs, in calls and in memory.
 *
 *   node chapters/chapter08/files/05_choose_a_chunk.ts
 *
 * The two costs are opposite: a small chunk keeps memory flat and multiplies the number of reads, and
 * a large chunk does the reverse. The number in the middle is a measurement, not a taste, which is
 * what example 3 and the record are for.
 */

import { planChunks } from "./plan.ts";

const SIZE = 1e9;

export function main(): number {
  console.log(
    `${"chunk".padStart(8)}${"reads".padStart(9)}${"peak".padStart(10)}${"build".padStart(12)}`,
  );
  console.log(`${"-".repeat(8)}${"-".repeat(9)}${"-".repeat(10)}${"-".repeat(12)}`);

  for (const chunkBytes of [64 * 1024, 1024 ** 2, 8 * 1024 ** 2, 64 * 1024 ** 2]) {
    const plan = planChunks(SIZE, chunkBytes);
    console.log(
      `${`${(chunkBytes / 1024).toFixed(0)} kB`.padStart(8)}${String(plan.chunks.length).padStart(9)}` +
        `${`${(plan.peakBytes / 1e6).toFixed(1)} MB`.padStart(10)}${`${plan.chunks.length} calls`.padStart(12)}`,
    );
  }

  console.log("");
  console.log("at 64 kB the plan is fifteen thousand promises for one second of hashing");
  console.log("at 64 MB it is fifteen, and the tab holds 128 MB: the trade is a number, not an opinion");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
