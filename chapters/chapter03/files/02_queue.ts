/**
 * Example 2 - twelve jobs, four at a time.
 *
 *   node chapters/chapter03/files/02_queue.ts
 *
 * The work is a timer, because the chapter is about the boundary and not about hashing. What
 * the output proves is the limit: one more than four never runs at once, and the peak is a
 * number the checks can assert.
 */

import { createScheduler, type Job } from "./queue.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function main(): Promise<number> {
  const jobs: Job<string>[] = Array.from({ length: 12 }, (_, index) => ({
    id: `job-${index + 1}`,
    run: async () => {
      await sleep(5);
      return `job-${index + 1}`;
    },
  }));

  const scheduler = createScheduler(4, jobs);
  const stats = await scheduler.drain();

  console.log(`limit            ${scheduler.limit}`);
  console.log(`submitted        ${jobs.length}`);
  console.log(`done             ${stats.done}`);
  console.log(`failed           ${stats.failed}`);
  console.log(`peak running     ${stats.peakRunning}`);
  console.log("");
  console.log(
    stats.peakRunning <= scheduler.limit
      ? `the limit held: at most ${scheduler.limit} jobs were in flight`
      : `the limit broke: ${stats.peakRunning} jobs were in flight`,
  );
  console.log("");
  for (const record of scheduler.records.slice(0, 6)) {
    console.log(`  ${record.id.padEnd(8)} ${record.state}`);
  }
  console.log(`  ... ${scheduler.records.length - 6} more`);

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
