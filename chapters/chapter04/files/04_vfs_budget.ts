/**
 * Example 4 - the write that is refused before the encoder starts.
 *
 *   node chapters/chapter04/files/04_vfs_budget.ts
 *
 * MEMFS is the wasm instance's memory, so a file that does not fit is not a slow file: it is an
 * allocation that fails somewhere inside a C library. The budget turns that into a message with
 * two numbers, and the numbers are the same pair chapter 3 established for the disk.
 */

import { QuotaExceeded } from "../../chapter03/files/storage.ts";
import { VirtualFiles } from "./vfs.ts";
import { formatBytes } from "./report.ts";

const BUDGET = 256 * 1e6;

export function main(): number {
  const files = new VirtualFiles(BUDGET);
  const reel = 120 * 1e6;

  console.log(`budget           ${formatBytes(BUDGET)} (the instance's memory, not the disk)`);
  console.log(`a reel           ${formatBytes(reel)}`);
  console.log("");

  files.write("reel.mp4", new Uint8Array(reel));
  console.log(`  reel.mp4       written, ${formatBytes(files.usedBytes())} used`);

  const output = 200 * 1e6;
  try {
    files.write("output.mp4", new Uint8Array(output));
    console.log("  output.mp4     written, which should not have happened");
  } catch (error) {
    if (!(error instanceof QuotaExceeded)) throw error;
    console.log(`  output.mp4     REFUSED (${formatBytes(output)} of new bytes)`);
    console.log(
      `                 needs ${formatBytes(error.neededBytes)}, budget ${formatBytes(
        error.budgetBytes,
      )}`,
    );
  }

  // A transcode needs room for the output as well as the input. That is the number nobody plans.
  const room = BUDGET - files.usedBytes();
  console.log("");
  console.log(`room left        ${formatBytes(room)}`);
  console.log(`a 120 MB input needs its 120 MB and the output's, which is why the budget is not the file size`);
  console.log("");
  console.log("the encoder never started, so nothing was half written");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
