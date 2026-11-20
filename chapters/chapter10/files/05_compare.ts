/**
 * Example 5 - the same job without a database, measured rather than dismissed.
 *
 *   node --expose-gc chapters/chapter10/files/05_compare.ts
 *
 * One million event objects in an array, a group by in a loop, and the process's own RSS around it.
 * This program exists because the honest answer at a million rows is that JavaScript is not slower:
 * the chapter's reason for DuckDB is the file format and the memory per row, and a baseline nobody
 * ran is how a book sells the wrong reason.
 */

import { KINDS } from "./queries.ts";
import { renderCompare } from "./report.ts";

const ROW_COUNT = 1_000_000;
const rssMb = (): number => Math.round(process.memoryUsage().rss / (1024 * 1024));

type Event = {
  readonly id: number;
  readonly userId: number;
  readonly kind: number;
  readonly day: number;
  readonly amount: number;
};

export async function main(): Promise<number> {
  const before = rssMb();

  const started = performance.now();
  const events: Event[] = new Array(ROW_COUNT);
  for (let i = 0; i < ROW_COUNT; i += 1) {
    events[i] = {
      id: i,
      userId: (Math.imul(i, 2654435761) >>> 0) % 1000,
      kind: i % KINDS.length,
      day: i % 365,
      amount: ((i * 7919) % 100_000) / 100,
    };
  }
  const buildMs = performance.now() - started;

  const groupStarted = performance.now();
  const sums = new Array<number>(KINDS.length).fill(0);
  const counts = new Array<number>(KINDS.length).fill(0);
  for (const event of events) {
    sums[event.kind] = (sums[event.kind] ?? 0) + event.amount;
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  }
  const groupMs = performance.now() - groupStarted;

  const after = rssMb();

  console.log(renderCompare({ rows: ROW_COUNT, buildMs, groupMs, rssMb: after - before }));
  console.log("");
  console.log(`sum of the seven kinds ${sums.reduce((sum, value) => sum + value, 0).toFixed(2)}`);
  console.log(`counts ${counts.join(", ")}`);
  console.log("");
  console.log("a million rows, one object each: the array is the cost, and the loop is not slow");

  return counts.reduce((sum, value) => sum + value, 0) === ROW_COUNT ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
