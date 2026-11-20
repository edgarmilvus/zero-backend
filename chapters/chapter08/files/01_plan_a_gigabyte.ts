/**
 * Example 1 - the plan, before any file exists.
 *
 *   node chapters/chapter08/files/01_plan_a_gigabyte.ts
 *
 * A gigabyte at four chunk sizes: how many chunks, how much is held at once, and what the last chunk
 * looks like when the file does not divide evenly.
 */

import { planChunks, estimatePeakBytes } from "./plan.ts";

const SIZE = 1e9;

export function main(): number {
  console.log(`${"chunk".padStart(8)}${"chunks".padStart(9)}${"peak".padStart(10)}  last chunk`);
  console.log(`${"-".repeat(8)}${"-".repeat(9)}${"-".repeat(10)}  ----------`);

  for (const chunkBytes of [4 * 1024 ** 2, 16 * 1024 ** 2, 64 * 1024 ** 2, 256 * 1024 ** 2]) {
    const plan = planChunks(SIZE, chunkBytes);
    const last = plan.chunks.at(-1);
    console.log(
      `${`${(chunkBytes / 1e6).toFixed(0)} MB`.padStart(8)}${String(plan.chunks.length).padStart(9)}` +
        `${`${(plan.peakBytes / 1e6).toFixed(0)} MB`.padStart(10)}  ` +
        `${last ? `${(last.to - last.from) / 1e6} MB` : "none"}`,
    );
  }

  console.log("");
  console.log(`whole file peak     ${(estimatePeakBytes(SIZE) / 1e9).toFixed(1)} GB for two copies`);
  console.log(`chunked at 64 MB    ${(estimatePeakBytes(64 * 1024 ** 2) / 1e6).toFixed(0)} MB`);
  console.log("");
  console.log("the plan is arithmetic: it refuses or it does not, and no file is opened to find out");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
