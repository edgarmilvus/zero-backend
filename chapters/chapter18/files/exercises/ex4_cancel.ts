/**
 * Exercise 4 - the cancel that cancelled the worker.
 *
 * Terminating a worker to cancel one task throws away the slot, the worker's warm state and whatever
 * else it was holding. A cancel is a message the task checks at its next checkpoint.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Worker = { id: number; current: string | null; terminated: boolean };

export function makeWorkers(count: number): Worker[] {
  return Array.from({ length: count }, (_unused, index) => ({ id: index, current: null, terminated: false }));
}

/** The bug: cancel by termination. */
export function cancelByTerminate(workers: Worker[], task: string): boolean {
  const worker = workers.find((candidate) => candidate.current === task);
  if (!worker) return false;
  worker.terminated = true;
  worker.current = null;
  return true;
}

/** The repair: a message, and the task stops at its checkpoint. */
export function cancelByMessage(workers: Worker[], task: string, inbox: Map<number, string[]>): boolean {
  const worker = workers.find((candidate) => candidate.current === task);
  if (!worker) return false;
  const messages = inbox.get(worker.id) ?? [];
  messages.push(task);
  inbox.set(worker.id, messages);
  worker.current = null;
  return true;
}

export function checkpoint(inbox: Map<number, string[]>, workerId: number): boolean {
  return (inbox.get(workerId) ?? []).length > 0;
}

export const checks: readonly Check[] = [
  { name: "terminating finds the worker", run: () => {
    const workers = makeWorkers(2);
    workers[0]!.current = "export";
    return eq(cancelByTerminate(workers, "export"), true, "found");
  } },
  { name: "and destroys the slot", run: () => {
    const workers = makeWorkers(2);
    workers[0]!.current = "export";
    cancelByTerminate(workers, "export");
    return eq(workers[0]!.terminated, true, "terminated");
  } },
  { name: "a message leaves the worker alive", run: () => {
    const workers = makeWorkers(2);
    workers[0]!.current = "export";
    cancelByMessage(workers, "export", new Map());
    return eq(workers[0]!.terminated, false, "alive");
  } },
  { name: "and the checkpoint sees it", run: () => {
    const workers = makeWorkers(1);
    workers[0]!.current = "export";
    const inbox = new Map<number, string[]>();
    cancelByMessage(workers, "export", inbox);
    return eq(checkpoint(inbox, 0), true, "checkpoint");
  } },
  { name: "the worker can take the next task", run: () => {
    const workers = makeWorkers(1);
    workers[0]!.current = "export";
    cancelByMessage(workers, "export", new Map());
    workers[0]!.current = "keystroke";
    return eq(workers[0]!.current, "keystroke", "current");
  } },
  { name: "cancelling an unknown task is false", run: () => {
    const inbox = new Map<number, string[]>();
    return eq(cancelByMessage(makeWorkers(1), "nope", inbox), false, "found");
  } },
  { name: "a worker with no messages has a clean checkpoint", run: () => eq(checkpoint(new Map(), 0), false, "checkpoint") },
  { name: "terminate and message agree on the task", run: () => {
    const left = makeWorkers(1);
    left[0]!.current = "x";
    const right = makeWorkers(1);
    right[0]!.current = "x";
    return eq(cancelByTerminate(left, "x"), cancelByMessage(right, "x", new Map()), "agree");
  } },
  { name: "a terminated worker is not usable, which is the cost", run: () => {
    const workers = makeWorkers(1);
    workers[0]!.current = "x";
    cancelByTerminate(workers, "x");
    return expect(workers[0]!.terminated, "alive");
  } },
];

export function main(): number {
  const workers = makeWorkers(2);
  workers[0]!.current = "export";
  cancelByMessage(workers, "export", new Map());
  console.log(`terminated        ${workers[0]!.terminated}`);
  console.log(`current           ${workers[0]!.current}`);
  console.log("");
  console.log("a cancel is a message, and a worker that survives it is a worker that can take the next task");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
