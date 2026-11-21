/**
 * Chapter 18 harness: 56 assertions over the pool, the scheduler and the numbers.
 *
 * The pool is tested with a fake worker, so the gate runs in node with no browser and no timing wheel.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool, type WorkerLike } from "./pool.ts";
import { Scheduler } from "./scheduler.ts";
import { percentile, summarize, throughput } from "./metrics.ts";
import { assertFrame, assertQueued, renderRun, renderStats } from "./report.ts";
import { fakeWorker } from "./fake.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };
const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => void checks.push({ name, run });

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}
function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  return true;
}
function throwsSync(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}
async function rejects(promise: Promise<unknown>, what: string): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: resolved`);
}

// --- the pool -----------------------------------------------------------------

check("a pool needs at least one worker", () => {
  const error = throwsSync(() => new Pool(0, () => fakeWorker().worker), "zero");
  return expect(error.message.includes("worker count"), error.message);
});
check("a task needs an id", async () => {
  const pool = new Pool(1, () => fakeWorker().worker);
  const error = await rejects(pool.run({ id: " ", payload: 1 }), "empty id");
  pool.close();
  return expect(error.message.includes("id"), error.message);
});
check("one task resolves", async () => {
  const pool = new Pool(1, () => fakeWorker((payload) => (payload as number) + 1).worker);
  const value = await pool.run({ id: "a", payload: 1 });
  pool.close();
  return eq(value, 2, "value");
});
check("the queue holds what the workers cannot take", () => {
  const pool = new Pool(2, () => fakeWorker().worker);
  for (let index = 0; index < 5; index += 1) pool.run({ id: `q${index}`, payload: index }).catch(() => undefined);
  eq(pool.running, 2, "running");
  eq(pool.queued, 3, "queued");
  pool.close();
  return true;
});
check("a pool of one runs one at a time", () => {
  const pool = new Pool(1, () => fakeWorker().worker);
  for (let index = 0; index < 3; index += 1) pool.run({ id: `s${index}`, payload: index }).catch(() => undefined);
  eq(pool.running, 1, "running");
  eq(pool.queued, 2, "queued");
  pool.close();
  return true;
});
check("every task's result arrives", async () => {
  const pool = new Pool(3, () => fakeWorker((payload) => (payload as number) * 10).worker);
  const values = await Promise.all(Array.from({ length: 9 }, (_, index) => pool.run<number>({ id: `r${index}`, payload: index })));
  pool.close();
  return eq(values.reduce((sum, value) => sum + value, 0), 360, "sum");
});
check("the stats count the done tasks", async () => {
  const pool = new Pool(2, () => fakeWorker().worker);
  await Promise.all([pool.run({ id: "a", payload: 1 }), pool.run({ id: "b", payload: 2 })]);
  const stats = pool.stats();
  pool.close();
  eq(stats.done, 2, "done");
  return eq(stats.failed, 0, "failed");
});
check("a worker failure rejects its task", async () => {
  const pool = new Pool(1, () =>
    fakeWorker(() => {
      throw new Error("worker exploded");
    }).worker,
  );
  const error = await rejects(pool.run({ id: "bad", payload: 1 }), "failure");
  pool.close();
  eq(error.message, "worker exploded", "message");
  return true;
});
check("a failure is counted, not swallowed", async () => {
  const pool = new Pool(1, () => fakeWorker(() => {
    throw new Error("no");
  }).worker);
  await rejects(pool.run({ id: "bad", payload: 1 }), "failure");
  const stats = pool.stats();
  pool.close();
  return eq(stats.failed, 1, "failed");
});
check("a queued task can be cancelled", async () => {
  const pool = new Pool(1, () => fakeWorker().worker);
  const first = pool.run({ id: "first", payload: 1 });
  const second = pool.run({ id: "second", payload: 2 });
  const cancelled = pool.cancel("second");
  await first;
  const error = await rejects(second, "cancel");
  pool.close();
  eq(cancelled, true, "cancelled");
  return expect(error.message.includes("before it started"), error.message);
});
check("a running task is cancelled by message", async () => {
  const fake = fakeWorker();
  const pool = new Pool(1, () => fake.worker);
  const task = pool.run({ id: "run", payload: 1 });
  const cancelled = pool.cancel("run");
  const error = await rejects(task, "cancel");
  pool.close();
  eq(cancelled, true, "cancelled");
  return expect(error.message.includes("cancelled"), error.message);
});
check("cancelling an unknown id is false", () => {
  const pool = new Pool(1, () => fakeWorker().worker);
  const result = pool.cancel("nope");
  pool.close();
  return eq(result, false, "cancelled");
});
check("closing rejects what is queued", async () => {
  const pool = new Pool(1, () => fakeWorker().worker);
  // The handlers go on before close: the pool rejects synchronously, and a rejection with no handler
  // yet is an unhandled rejection that takes the process down.
  const first = pool.run({ id: "a", payload: 1 }).catch((error: Error) => error);
  const queued = pool.run({ id: "b", payload: 2 }).catch((error: Error) => error);
  pool.close();
  const [, b] = await Promise.all([first, queued]);
  return eq(b instanceof Error && b.message.includes("closed"), true, String(b));
});
check("a closed pool refuses new work", async () => {
  const pool = new Pool(1, () => fakeWorker().worker);
  pool.close();
  const error = await rejects(pool.run({ id: "late", payload: 1 }), "late");
  return expect(error.message.includes("closed"), error.message);
});
check("closing terminates the workers", () => {
  const fakes = [fakeWorker(), fakeWorker()];
  let index = 0;
  const pool = new Pool(2, () => fakes[index++]!.worker);
  pool.close();
  return expect(fakes.every((fake) => fake.terminated), "alive");
});
check("the longest wait is recorded", async () => {
  let clock = 0;
  const pool = new Pool(1, () => fakeWorker().worker, () => clock);
  const first = pool.run({ id: "a", payload: 1 });
  const second = pool.run({ id: "b", payload: 2 });
  // The clock moves after the task is queued and before the slot frees, which is the wait.
  clock = 5;
  await Promise.all([first, second]);
  const stats = pool.stats();
  pool.close();
  return eq(stats.longestWaitMs, 5, "wait");
});
check("a transfer list reaches the worker", async () => {
  const fake = fakeWorker();
  const pool = new Pool(1, () => fake.worker);
  const buffer = new ArrayBuffer(8);
  await pool.run({ id: "t", payload: buffer, transfer: [buffer] });
  pool.close();
  const message = fake.received[0] as { transfer?: unknown };
  return expect(message !== undefined, "no message");
});
check("the worker receives the payload", async () => {
  const fake = fakeWorker();
  const pool = new Pool(1, () => fake.worker);
  await pool.run({ id: "p", payload: { hello: 1 } });
  pool.close();
  const message = fake.received[0] as { payload?: { hello?: number } };
  return eq(message.payload?.hello, 1, "payload");
});
check("a message with the wrong id is ignored", async () => {
  const fake = fakeWorker();
  const pool = new Pool(1, () => fake.worker);
  const task = pool.run({ id: "right", payload: 1 });
  fake.worker.onmessage?.({ data: { id: "wrong", ok: true, value: 99 } });
  const value = await task;
  pool.close();
  return eq(value, 1, "value");
});
check("two pools do not share a queue", () => {
  const left = new Pool(1, () => fakeWorker().worker);
  const right = new Pool(2, () => fakeWorker().worker);
  left.run({ id: "l", payload: 1 }).catch(() => undefined);
  left.run({ id: "l2", payload: 2 }).catch(() => undefined);
  eq(left.queued, 1, "left");
  eq(right.queued, 0, "right");
  left.close();
  right.close();
  return true;
});

// --- the scheduler ------------------------------------------------------------

check("a scheduler needs a positive limit", () => {
  const error = throwsSync(() => new Scheduler(0), "zero");
  return expect(error.message.includes("slot count"), error.message);
});
check("a scheduler needs a positive ratio", () => {
  const error = throwsSync(() => new Scheduler(1, 0), "zero");
  return expect(error.message.includes("ratio"), error.message);
});
check("an interactive job is admitted when there is a slot", () => {
  const scheduler = new Scheduler(2);
  const result = scheduler.admit({ id: "a", priority: "interactive", run: async () => 1 });
  return eq(result.reason, "ok", "reason");
});
check("a background job is admitted on an idle scheduler", () => {
  const scheduler = new Scheduler(2);
  const result = scheduler.admit({ id: "b", priority: "background", run: async () => 1 });
  return eq(result.admitted, true, "admitted");
});
check("a background job waits behind a queued interactive one", () => {
  const scheduler = new Scheduler(1);
  scheduler.admit({ id: "a", priority: "interactive", run: async () => 1 });
  scheduler.admit({ id: "b", priority: "interactive", run: async () => 2 });
  const result = scheduler.admit({ id: "c", priority: "background", run: async () => 3 });
  eq(result.admitted, false, "admitted");
  return eq(scheduler.pending, 2, "pending");
});
check("a full scheduler defers everything", () => {
  const scheduler = new Scheduler(1);
  scheduler.admit({ id: "a", priority: "interactive", run: async () => 1 });
  const result = scheduler.admit({ id: "b", priority: "interactive", run: async () => 2 });
  eq(result.admitted, false, "admitted");
  return eq(scheduler.pending, 1, "pending");
});
check("the next job is the queued interactive one", () => {
  const scheduler = new Scheduler(1);
  scheduler.admit({ id: "running", priority: "interactive", run: async () => 0 });
  scheduler.admit({ id: "first", priority: "interactive", run: async () => 1 });
  scheduler.admit({ id: "second", priority: "background", run: async () => 2 });
  scheduler.finish();
  return eq(scheduler.next()?.id, "first", "order");
});
check("a closed scheduler admits nothing", () => {
  const scheduler = new Scheduler(1);
  scheduler.close();
  const result = scheduler.admit({ id: "a", priority: "interactive", run: async () => 1 });
  return eq(result.reason, "closed", "reason");
});
check("the pending count adds both queues", () => {
  const scheduler = new Scheduler(1);
  scheduler.admit({ id: "a", priority: "interactive", run: async () => 1 });
  scheduler.admit({ id: "b", priority: "interactive", run: async () => 2 });
  scheduler.admit({ id: "c", priority: "background", run: async () => 3 });
  return eq(scheduler.pending, 2, "pending");
});
check("finishing frees a slot", () => {
  const scheduler = new Scheduler(1);
  scheduler.admit({ id: "a", priority: "interactive", run: async () => 1 });
  scheduler.finish();
  const result = scheduler.admit({ id: "b", priority: "interactive", run: async () => 2 });
  return eq(result.admitted, true, "admitted");
});

// --- the metrics --------------------------------------------------------------

check("an empty list has a zero percentile", () => eq(percentile([], 0.5), 0, "p50"));
check("the p50 of one to ten is five", () => eq(percentile([10, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0.5), 5, "p50"));
check("the p95 of one to twenty is nineteen", () =>
  eq(percentile(Array.from({ length: 20 }, (_, index) => index + 1), 0.95), 19, "p95"),
);
check("a share outside zero to one is refused", () => {
  const error = throwsSync(() => percentile([1], 0), "zero");
  return expect(error.message.includes("share"), error.message);
});
check("throughput is per second", () => eq(throughput(10, 500), 20, "throughput"));
check("a zero duration has no throughput", () => eq(throughput(10, 0), 0, "throughput"));
check("a summary names its five numbers", () =>
  eq(Object.keys(summarize([1, 2, 3])).sort().join(","), "count,max,p50,p95,totalMs", "keys"),
);
check("a summary's max is the largest", () => eq(summarize([1, 9, 3]).max, 9, "max"));

// --- more of the same, from the edges -----------------------------------------

check("the stats report the worker count", () => {
  const pool = new Pool(3, () => fakeWorker().worker);
  const stats = pool.stats();
  pool.close();
  return eq(stats.workers, 3, "workers");
});
check("a settled task frees its slot", async () => {
  const pool = new Pool(1, () => fakeWorker().worker);
  await pool.run({ id: "a", payload: 1 });
  return eq(pool.running, 0, "running");
});
check("cancelling does not terminate a worker", async () => {
  const fake = fakeWorker();
  const pool = new Pool(1, () => fake.worker);
  const task = pool.run({ id: "c", payload: 1 });
  pool.cancel("c");
  await rejects(task, "cancel");
  const alive = !fake.terminated;
  pool.close();
  return expect(alive, "terminated");
});
check("the scheduler hands out a background job after the ratio", () => {
  const scheduler = new Scheduler(2, 2);
  for (let index = 0; index < 3; index += 1) {
    scheduler.admit({ id: `i${index}`, priority: "interactive", run: async () => index });
    scheduler.finish();
  }
  scheduler.admit({ id: "bg", priority: "background", run: async () => "bg" });
  scheduler.next();
  scheduler.next();
  scheduler.next();
  return expect(scheduler.pending >= 0, "pending");
});
check("an empty scheduler has no next job", () => {
  const scheduler = new Scheduler(1);
  return eq(scheduler.next(), undefined, "next");
});
check("background jobs keep their order", () => {
  const scheduler = new Scheduler(1);
  scheduler.admit({ id: "run", priority: "interactive", run: async () => 0 });
  scheduler.admit({ id: "b1", priority: "background", run: async () => 1 });
  scheduler.admit({ id: "b2", priority: "background", run: async () => 2 });
  scheduler.finish();
  return eq(scheduler.next()?.id, "b1", "order");
});
check("the summary totals the values", () => eq(summarize([1, 2, 3]).totalMs, 6, "total"));
check("a single value's percentile is the value", () => eq(percentile([7], 0.05), 7, "single"));
check("the stats rendering names the failures", () => {
  const text = renderStats({ workers: 1, running: 0, queued: 0, done: 2, failed: 1, longestWaitMs: 0 });
  return expect(text.includes("1 failed"), text);
});

// --- the report and the programs ----------------------------------------------

check("the stats rendering names the queue", () => {
  const text = renderStats({ workers: 2, running: 1, queued: 3, done: 4, failed: 0, longestWaitMs: 5 });
  return expect(text.includes("queued            3"), text);
});
check("the run rendering names the frame", () => {
  const text = renderRun("pooled", summarize([1, 2]), 16);
  return expect(text.includes("longest frame 16 ms"), text);
});
check("a frame over the budget throws", () => {
  const error = throwsSync(() => assertFrame(120), "over");
  return expect(error.message.includes("budget"), error.message);
});
check("a drained queue passes the assertion", () => {
  const error = throwsSync(
    () => assertQueued({ workers: 2, running: 0, queued: 1, done: 1, failed: 0, longestWaitMs: 0 }),
    "left",
  );
  return expect(error.message.includes("left"), error.message);
});

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("01 runs twelve tasks on four workers", () => {
  const result = run("01_pool.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("queued at start   8"), result.stdout);
});
check("02 keeps the queue under its limit", () => {
  const result = run("02_backpressure.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("deepest queue     8"), result.stdout);
});
check("03 defers the background export", () => {
  const result = run("03_scheduler.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("admitted false"), result.stdout);
});
check("04 cancels without killing a worker", () => {
  const result = run("04_cancel.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("workers alive     true"), result.stdout);
});
check("05 compares serial and pooled", () => {
  const result = run("05_bench.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("pooled"), result.stdout);
});

// --- run ----------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
    return 1;
  }
  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }
  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
