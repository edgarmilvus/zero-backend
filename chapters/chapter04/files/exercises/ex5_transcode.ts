/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * Reads a job record, asks the table whether the input and the output would have fitted, and
 * prints the numbers the ledger needs. It decides nothing: the ratios come from the schema and
 * the memory arithmetic from the core.
 *
 *   node chapters/chapter04/files/exercises/ex5_transcode.ts <job.json>
 */

import { newTable, put, totalBytes } from "./vfs_core.ts";
import { normalize, readJob } from "./job_record.ts";

const BUDGET = 256 * 1e6;

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_transcode.ts <job.json>");
    return 2;
  }

  let job;
  try {
    job = readJob(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(job);

  let table = newTable(BUDGET);
  try {
    // The job holds the input and the output at the same time, which is the number nobody plans.
    table = put(table, job.input, job.inputBytes);
    table = put(table, job.output, job.outputBytes);
  } catch (error) {
    console.error(`MEMFS: ${(error as Error).message}`);
    return 1;
  }

  console.log(`input            ${job.input}, ${job.inputBytes} bytes`);
  console.log(`output           ${job.output}, ${job.outputBytes} bytes`);
  console.log(`ratio            ${numbers.ratio.toFixed(2)}x smaller`);
  console.log(`speed            ${numbers.speedup.toFixed(2)}x real time`);
  console.log(`MEMFS peak       ${totalBytes(table)} bytes of ${BUDGET}`);
  console.log("");
  console.log("both files were in the instance at once, and the budget knew it");
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
