/**
 * Exercise 1 - the queue that ran in the wrong order.
 *
 * A pool that hands the next task to the first free worker and keeps no queue is a pool that runs
 * whatever arrives. An interactive task posted behind a background export waits for the export, and the
 * interface stutters for the length of it.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Job = { readonly id: string; readonly priority: "interactive" | "background" };

/** The bug: no queue, so a task starts when the producer posts it. */
export function immediate(jobs: readonly Job[]): string[] {
  return jobs.map((job) => job.id);
}

/** The repair: a queue ordered by priority, FIFO inside a priority. */
export function queued(jobs: readonly Job[]): string[] {
  const interactive = jobs.filter((job) => job.priority === "interactive");
  const background = jobs.filter((job) => job.priority === "background");
  return [...interactive, ...background].map((job) => job.id);
}

const MIXED: readonly Job[] = [
  { id: "export-1", priority: "background" },
  { id: "keystroke-1", priority: "interactive" },
  { id: "export-2", priority: "background" },
  { id: "keystroke-2", priority: "interactive" },
];

export const checks: readonly Check[] = [
  { name: "the immediate pool runs the export first", run: () => eq(immediate(MIXED)[0], "export-1", "first") },
  { name: "the queued pool runs a keystroke first", run: () => eq(queued(MIXED)[0], "keystroke-1", "first") },
  { name: "the queue keeps both keystrokes ahead of the exports", run: () => eq(queued(MIXED).slice(0, 2).join(","), "keystroke-1,keystroke-2", "order") },
  { name: "FIFO inside a priority", run: () => eq(queued(MIXED).slice(2).join(","), "export-1,export-2", "order") },
  { name: "every job appears exactly once", run: () => eq(new Set(queued(MIXED)).size, MIXED.length, "count") },
  { name: "an empty queue is empty", run: () => eq(queued([]).length, 0, "empty") },
  { name: "one priority only keeps its order", run: () => {
    const jobs: Job[] = [{ id: "a", priority: "background" }, { id: "b", priority: "background" }];
    return eq(queued(jobs).join(","), "a,b", "order");
  } },
  { name: "the queued order differs from the arrival order", run: () => expect(queued(MIXED).join(",") !== immediate(MIXED).join(","), "same") },
];

export function main(): number {
  console.log(`immediate         ${immediate(MIXED).join(", ")}`);
  console.log(`queued            ${queued(MIXED).join(", ")}`);
  console.log("");
  console.log("a pool with no queue is a pool that runs whatever arrives first");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
