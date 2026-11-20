/**
 * Chapter 3 harness: 56 assertions on the port, the queue and the pool.
 *
 * The queue is tested with no worker, the pool with no thread, and the store with no disk. The
 * three fakes are the point: a chapter about a browser filesystem that can only be tested in a
 * browser is a chapter nobody can run in CI.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MemoryStorage,
  QuotaExceeded,
  assertEntryShape,
  totalBytes,
  type Entry,
} from "./storage.ts";
import { createScheduler, drain, stats, submit, type Job } from "./queue.ts";
import { PoolError, createPool, poolSize, type WorkerLike } from "./pool.ts";
import {
  assertNoMainThreadWork,
  assertPortParity,
  renderInventory,
  renderThroughput,
} from "./report.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };

const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => {
  checks.push({ name, run });
};

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}

function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) {
    throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  }
  return true;
}

async function throwsAsync(fn: () => Promise<unknown>, what: string): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

function throwsSync(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (data: Uint8Array): string => new TextDecoder().decode(data);

/** A store with a fixed clock, so two runs produce the same inventory. */
const store = (budget = 1e6): MemoryStorage => new MemoryStorage(budget, () => 1_700_000_000_000);

/** A worker that answers with the payload doubled, or fails, or never answers. */
function worker(options: { double: number } & { fail?: boolean } & { silent?: boolean }): WorkerLike {
  const listeners: ((event: MessageEvent) => void)[] = [];
  return {
    postMessage(message: unknown) {
      const { id, payload } = message as { id: string; payload: number };
      if (options.silent) return;
      setTimeout(() => {
        const data = options.fail
          ? { id, ok: false, error: "the worker exploded" }
          : { id, ok: true, value: payload * options.double };
        for (const listener of listeners) listener({ data } as MessageEvent);
      }, 1);
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    terminate() {
      listeners.length = 0;
    },
  };
}

// --- the port ---------------------------------------------------------------

check("a write reads back the same bytes", async () => {
  const s = store();
  await s.write("a.txt", bytes("hello"));
  return eq(text(await s.read("a.txt")), "hello", "read");
});
check("the inventory is sorted by name", async () => {
  const s = store();
  await s.write("c.txt", bytes("c"));
  await s.write("a.txt", bytes("a"));
  await s.write("b.txt", bytes("b"));
  return eq((await s.list()).map((entry) => entry.name).join(","), "a.txt,b.txt,c.txt", "order");
});
check("the inventory counts every file", async () => {
  const s = store();
  await s.write("a.txt", bytes("a"));
  await s.write("b.txt", bytes("bb"));
  return eq((await s.list()).length, 2, "count");
});
check("stat reports the size", async () => {
  const s = store();
  await s.write("a.txt", bytes("12345"));
  return eq((await s.stat("a.txt")).bytes, 5, "bytes");
});
check("stat on a missing file names the file", async () => {
  const error = await throwsAsync(() => store().stat("ghost.txt"), "missing file");
  return expect(error.message.includes("ghost.txt"), error.message);
});
check("read on a missing file names the file", async () => {
  const error = await throwsAsync(() => store().read("ghost.txt"), "missing file");
  return expect(error.message.includes("ghost.txt"), error.message);
});
check("remove deletes and the inventory shrinks", async () => {
  const s = store();
  await s.write("a.txt", bytes("a"));
  await s.remove("a.txt");
  return eq((await s.list()).length, 0, "count");
});
check("removing twice throws", async () => {
  const s = store();
  await s.write("a.txt", bytes("a"));
  await s.remove("a.txt");
  return expect((await throwsAsync(() => s.remove("a.txt"), "second remove")) instanceof Error, "threw");
});
check("a name with a slash is refused", async () => {
  const error = await throwsAsync(() => store().write("dir/a.txt", bytes("a")), "slash");
  return expect(error.message.includes("single path segment"), error.message);
});
check("an empty name is refused", async () => {
  const error = await throwsAsync(() => store().write("", bytes("a")), "empty name");
  return expect(error.message.includes("segment"), error.message);
});
check("totalBytes adds the inventory", async () => {
  const s = store();
  await s.write("a.txt", bytes("123"));
  await s.write("b.txt", bytes("45"));
  return eq(totalBytes(await s.list()), 5, "total");
});
check("every entry the store returns has the four fields", async () => {
  const s = store();
  await s.write("a.bin", new Uint8Array(3));
  for (const entry of await s.list()) assertEntryShape(entry);
  return expect(assertEntryShape((await s.list())[0]!) === undefined, "shape");
});
check("an overwrite reads back the new bytes", async () => {
  const s = store();
  await s.write("a.txt", bytes("first"));
  await s.write("a.txt", bytes("second"));
  return eq(text(await s.read("a.txt")), "second", "read");
});
check("an entry with a bad kind is refused", () => {
  const bad = { name: "x", bytes: 1, kind: "socket", modifiedMs: 0 } as unknown as Entry;
  const error = throwsSync(() => assertEntryShape(bad), "bad kind");
  return expect(error.message.includes("kind"), error.message);
});

// --- the budget -------------------------------------------------------------

check("a write that fits is accepted", async () => {
  const s = store(1000);
  await s.write("a.bin", new Uint8Array(600));
  return eq((await s.list()).length, 1, "count");
});
check("a write past the budget is refused before it starts", async () => {
  const s = store(1000);
  await s.write("a.bin", new Uint8Array(600));
  const error = await throwsAsync(() => s.write("b.bin", new Uint8Array(600)), "over budget");
  return expect(error instanceof QuotaExceeded, error.name);
});
check("the refusal carries both numbers", async () => {
  const s = store(1000);
  await s.write("a.bin", new Uint8Array(600));
  const error = (await throwsAsync(() => s.write("b.bin", new Uint8Array(600)), "over")) as QuotaExceeded;
  eq(error.budgetBytes, 1000, "budget");
  return eq(error.neededBytes, 1200, "needed");
});
check("a refused write leaves the store as it was", async () => {
  const s = store(1000);
  await s.write("a.bin", new Uint8Array(600));
  await throwsAsync(() => s.write("b.bin", new Uint8Array(600)), "over");
  const entries = await s.list();
  eq(entries.length, 1, "count");
  return eq(totalBytes(entries), 600, "bytes");
});
check("overwriting a name does not double count its bytes", async () => {
  const s = store(1000);
  await s.write("a.bin", new Uint8Array(600));
  await s.write("a.bin", new Uint8Array(600));
  return eq(totalBytes(await s.list()), 600, "bytes");
});

// --- the queue --------------------------------------------------------------

check("a limit of zero is refused", () =>
  expect(throwsSync(() => createScheduler(0, []), "zero limit").message.includes("positive"), "message"),
);
check("a fractional limit is refused", () =>
  expect(throwsSync(() => createScheduler(1.5, []), "fractional limit").message.includes("integer"), "message"),
);
check("an empty job list drains immediately", async () => {
  const s = createScheduler(4, []);
  const result = await s.drain();
  return eq(result.done + result.failed + result.queued + result.running, 0, "nothing");
});
check("twelve jobs with a limit of four all finish", async () => {
  const jobs: Job<number>[] = Array.from({ length: 12 }, (_, index) => ({ id: `j${index}`, run: () => index }));
  return eq((await createScheduler(4, jobs).drain()).done, 12, "done");
});
check("the peak running count is exactly the limit", async () => {
  const jobs: Job<void>[] = Array.from({ length: 12 }, (_, index) => ({
    id: `j${index}`,
    run: () => new Promise<void>((resolve) => setTimeout(resolve, 2)),
  }));
  return eq((await createScheduler(4, jobs).drain()).peakRunning, 4, "peak");
});
check("the peak never exceeds the limit", async () => {
  const jobs: Job<void>[] = Array.from({ length: 20 }, (_, index) => ({
    id: `j${index}`,
    run: () => new Promise<void>((resolve) => setTimeout(resolve, 1)),
  }));
  const result = await createScheduler(3, jobs).drain();
  return expect(result.peakRunning <= 3, `peak ${result.peakRunning}`);
});
check("a job that throws is recorded as failed with its message", async () => {
  const jobs: Job<void>[] = [
    { id: "ok", run: () => {} },
    { id: "bad", run: () => { throw new Error("boom"); } },
  ];
  const scheduler = createScheduler(2, jobs);
  const result = await scheduler.drain();
  const failed = scheduler.records.find((record) => record.id === "bad");
  eq(result.failed, 1, "failed");
  return eq(failed?.error, "boom", "error");
});
check("one failure does not stop the others", async () => {
  const jobs: Job<void>[] = [
    { id: "a", run: () => { throw new Error("boom"); } },
    { id: "b", run: () => {} },
    { id: "c", run: () => {} },
  ];
  const result = await createScheduler(1, jobs).drain();
  eq(result.failed, 1, "failed");
  return eq(result.done, 2, "done");
});
check("stats before draining says everything is queued", () => {
  const scheduler = submit(2, [{ id: "a", run: () => {} }, { id: "b", run: () => {} }]);
  const before = stats(scheduler);
  eq(before.queued, 2, "queued");
  return eq(before.done, 0, "done");
});
check("the records keep submission order", async () => {
  const jobs: Job<void>[] = ["a", "b", "c"].map((id) => ({ id, run: () => {} }));
  const scheduler = createScheduler(1, jobs);
  await drain(scheduler);
  return eq(scheduler.records.map((record) => record.id).join(","), "a,b,c", "order");
});
check("a settled job records when it ended", async () => {
  const scheduler = createScheduler(1, [{ id: "a", run: () => {} }]);
  await scheduler.drain();
  const record = scheduler.records[0]!;
  return eq(record.endedAtMs !== null && record.startedAtMs !== null, true, "timestamps");
});
check("a failed job keeps its id in the records", async () => {
  const scheduler = createScheduler(1, [{ id: "bad-one", run: () => { throw new Error("x"); } }]);
  await scheduler.drain();
  const record = scheduler.records.find((entry) => entry.state === "failed");
  return eq(record?.id, "bad-one", "id");
});
check("pump starts no more than the limit", async () => {
  const jobs: Job<void>[] = Array.from({ length: 6 }, (_, index) => ({
    id: `j${index}`,
    run: () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
  }));
  const scheduler = createScheduler(2, jobs);
  await scheduler.pump();
  eq(stats(scheduler).running, 2, "running");
  await scheduler.drain();
  return eq(stats(scheduler).done, 6, "done");
});

// --- the pool ---------------------------------------------------------------

check("a pool of zero is refused", () =>
  expect(throwsSync(() => createPool(() => worker({ double: 2 }), 0), "zero").message.includes("positive"), "message"),
);
check("a job resolves with the worker's value", async () => {
  const pool = createPool(() => worker({ double: 2 }), 1);
  eq(await pool.run<number>("j1", 21), 42, "answer");
  pool.close();
  return true;
});
check("nine jobs over three workers keep their ids", async () => {
  const pool = createPool(() => worker({ double: 2 }), 3);
  const answers = await Promise.all(
    Array.from({ length: 9 }, (_, index) => pool.run<number>(`j${index}`, index + 1)),
  );
  pool.close();
  return eq(answers.join(","), "2,4,6,8,10,12,14,16,18", "answers");
});
check("pending returns to zero after the answers", async () => {
  const pool = createPool(() => worker({ double: 2 }), 2);
  await Promise.all([pool.run("a", 1), pool.run("b", 2)]);
  const pending = pool.pending;
  pool.close();
  return eq(pending, 0, "pending");
});
check("a failing worker rejects with a PoolError", async () => {
  const pool = createPool(() => worker({ double: 2, fail: true }), 1);
  const error = await throwsAsync(() => pool.run("j1", 1), "worker failure");
  pool.close();
  return expect(error instanceof PoolError, error.name);
});
check("the PoolError carries the job id", async () => {
  const pool = createPool(() => worker({ double: 2, fail: true }), 1);
  const error = (await throwsAsync(() => pool.run("job-7", 1), "failure")) as PoolError;
  pool.close();
  return eq(error.jobId, "job-7", "jobId");
});
check("closing rejects a job that never answered", async () => {
  const pool = createPool(() => worker({ double: 2, silent: true }), 1);
  const pending = pool.run("j1", 1);
  pool.close();
  const error = await throwsAsync(() => pending, "closed");
  return expect(error.message.includes("closed"), error.message);
});
check("a run after close is rejected", async () => {
  const pool = createPool(() => worker({ double: 2 }), 1);
  pool.close();
  return expect((await throwsAsync(() => pool.run("j", 1), "after close")) instanceof PoolError, "PoolError");
});
check("two pools do not share their workers", async () => {
  const left = createPool(() => worker({ double: 2 }), 1);
  const right = createPool(() => worker({ double: 3 }), 1);
  const answers = await Promise.all([left.run<number>("a", 5), right.run<number>("a", 5)]);
  left.close();
  right.close();
  return eq(answers.join(","), "10,15", "answers");
});
check("poolSize reports the size", () => {
  const pool = createPool(() => worker({ double: 2 }), 4);
  const size = poolSize(pool);
  pool.close();
  return eq(size, 4, "size");
});

// --- the report -------------------------------------------------------------

check("the inventory has a header, the rows and a total", async () => {
  const s = store();
  await s.write("a.txt", bytes("abc"));
  const rendered = renderInventory(await s.list());
  expect(rendered.includes("file"), "header");
  expect(rendered.includes("a.txt"), "row");
  return expect(rendered.includes("1 files"), "total");
});
check("an empty inventory still prints its total", () => {
  const rendered = renderInventory([]);
  expect(rendered.includes("0 files"), rendered);
  return expect(rendered.includes("0 bytes"), "bytes line");
});
check("the throughput is megabytes a second", () => {
  const line = renderThroughput("writes", 2_000_000, 1000);
  expect(line.includes("2.0 MB/s"), line);
  return expect(line.includes("2000000 bytes"), line);
});
check("a zero wall clock says unmeasured, not infinite", () =>
  expect(renderThroughput("writes", 1000, 0).includes("unmeasured"), "unmeasured"),
);
check("two identical stores pass the parity check", async () => {
  const a = store();
  const b = store();
  await a.write("x.bin", new Uint8Array(4));
  await b.write("x.bin", new Uint8Array(4));
  return expect(assertPortParity(await a.list(), await b.list()) === undefined, "should not throw");
});
check("a size difference fails it, with both shapes", async () => {
  const a = store();
  const b = store();
  await a.write("x.bin", new Uint8Array(4));
  await b.write("x.bin", new Uint8Array(5));
  const error = throwsSync(() => assertPortParity([{ name: "x.bin", bytes: 4, kind: "file", modifiedMs: 0 }], [{ name: "x.bin", bytes: 5, kind: "file", modifiedMs: 0 }]), "parity");
  return expect(error.message.includes("x.bin:5"), error.message);
});
check("a report inside the budget passes", () =>
  expect(assertNoMainThreadWork({ jobMs: 500, mainThreadBlockedMs: 120, budgetMs: 200 }) === undefined, "should not throw"),
);
check("blocking past the budget is refused", () => {
  const error = throwsSync(() => assertNoMainThreadWork({ jobMs: 900, mainThreadBlockedMs: 900, budgetMs: 200 }), "blocked");
  return expect(error.message.includes("budget"), error.message);
});
check("a job too short for the blocking is refused", () => {
  const error = throwsSync(() => assertNoMainThreadWork({ jobMs: 40, mainThreadBlockedMs: 900, budgetMs: 1000 }), "ratio");
  return expect(error.message.includes("too short"), error.message);
});

// --- the programs -----------------------------------------------------------

const run = (script: string) =>
  spawnSync(process.execPath, [join(ROOT, script)], { encoding: "utf8" });

check("01 runs the port and reports parity", () => {
  const result = run("01_memory_port.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("parity"), "parity line");
});
check("02 holds its limit and says so", () => {
  const result = run("02_queue.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("the limit held"), "limit line");
});
check("03 answers nine jobs over three workers", () => {
  const result = run("03_pool.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("2, 4, 6"), "answers");
});
check("04 refuses OPFS honestly in node", () => {
  const result = run("04_opfs_roundtrip.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("no OPFS"), "honest refusal");
});
check("05 accepts five files and refuses the sixth", () => {
  const result = run("05_quota.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("REFUSED"), "refusal");
  return expect(result.stdout.includes("5 files"), "five files");
});

// --- run --------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
    return 1;
  }

  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${number}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${number}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }

  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
