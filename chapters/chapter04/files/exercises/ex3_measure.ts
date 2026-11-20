/**
 * Exercise 3 - the write that costs more than the transcode.
 *
 * The stopwatch starts at `exec`, so the report says the job took 400 ms when the page was busy
 * for 900: the 500 ms that moved the input into MEMFS and the output back out are invisible.
 *
 * The repair times the whole function, and then splits it, because a reader who learns only the
 * total will spend a week optimizing an encoder when the copies are the cost.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A fake instance with the three costs the chapter cares about, in milliseconds. */
export type FakeJob = {
  readonly writeMs: number;
  readonly execMs: number;
  readonly readMs: number;
};

export type Timing = {
  readonly writeMs: number;
  readonly execMs: number;
  readonly readMs: number;
  readonly totalMs: number;
};

/** The bug: time only the encoder. */
export async function timedAtExec(job: FakeJob): Promise<Timing> {
  await sleep(job.writeMs);
  const started = performance.now();
  await sleep(job.execMs);
  const execMs = performance.now() - started;
  await sleep(job.readMs);
  return { writeMs: 0, execMs, readMs: 0, totalMs: execMs };
}

/** The repair: time the three phases, and the sum. */
export async function timedWhole(job: FakeJob): Promise<Timing> {
  const started = performance.now();

  const writeStarted = performance.now();
  await sleep(job.writeMs);
  const writeMs = performance.now() - writeStarted;

  const execStarted = performance.now();
  await sleep(job.execMs);
  const execMs = performance.now() - execStarted;

  const readStarted = performance.now();
  await sleep(job.readMs);
  const readMs = performance.now() - readStarted;

  return { writeMs, execMs, readMs, totalMs: performance.now() - started };
}

const JOB: FakeJob = { writeMs: 300, execMs: 400, readMs: 200 };

export const checks: readonly Check[] = [
  {
    name: "the exec-only timer reports the encode and nothing else",
    run: async () => {
      const timing = await timedAtExec(JOB);
      expect(timing.totalMs < JOB.writeMs + JOB.execMs + JOB.readMs, "the total was honest");
      return eq(timing.writeMs + timing.readMs, 0, "copies");
    },
  },
  {
    name: "the whole timer is larger than the exec-only one",
    run: async () => {
      const exec = await timedAtExec(JOB);
      const whole = await timedWhole(JOB);
      return expect(whole.totalMs > exec.totalMs, `${whole.totalMs} vs ${exec.totalMs}`);
    },
  },
  {
    name: "the whole timer includes the write",
    run: async () => {
      const timing = await timedWhole(JOB);
      return expect(timing.writeMs > JOB.writeMs * 0.5, `write ${timing.writeMs}`);
    },
  },
  {
    name: "the whole timer includes the read",
    run: async () => {
      const timing = await timedWhole(JOB);
      return expect(timing.readMs > JOB.readMs * 0.5, `read ${timing.readMs}`);
    },
  },
  {
    name: "the three phases add up to the total, within a frame",
    run: async () => {
      const timing = await timedWhole(JOB);
      const sum = timing.writeMs + timing.execMs + timing.readMs;
      return expect(Math.abs(sum - timing.totalMs) < 50, `${sum} vs ${timing.totalMs}`);
    },
  },
  {
    name: "the copies are more than half the job in this one",
    run: async () => {
      const timing = await timedWhole(JOB);
      return expect((timing.writeMs + timing.readMs) / timing.totalMs > 0.5, "copies share");
    },
  },
  {
    name: "a job with no copies is dominated by the encoder",
    run: async () => {
      const timing = await timedWhole({ writeMs: 0, execMs: 200, readMs: 0 });
      return expect(timing.execMs / timing.totalMs > 0.8, "exec share");
    },
  },
  {
    name: "the ratio the report needs is total over exec",
    run: async () => {
      const timing = await timedWhole(JOB);
      return expect(timing.totalMs / timing.execMs > 1.5, "ratio");
    },
  },
  {
    name: "a zero-duration job does not divide by zero",
    run: async () => {
      const timing = await timedWhole({ writeMs: 0, execMs: 0, readMs: 0 });
      return expect(Number.isFinite(timing.totalMs), "total");
    },
  },
  {
    name: "the same job twice gives the same phases",
    run: async () => {
      const first = await timedWhole(JOB);
      const second = await timedWhole(JOB);
      return expect(Math.abs(first.totalMs - second.totalMs) < 100, "stability");
    },
  },
];

export function main(): number {
  const run = async (): Promise<void> => {
    const exec = await timedAtExec(JOB);
    const whole = await timedWhole(JOB);
    console.log(`exec only        ${exec.totalMs.toFixed(0)} ms`);
    console.log(`whole job        ${whole.totalMs.toFixed(0)} ms`);
    console.log(`  write          ${whole.writeMs.toFixed(0)} ms`);
    console.log(`  exec           ${whole.execMs.toFixed(0)} ms`);
    console.log(`  read           ${whole.readMs.toFixed(0)} ms`);
    console.log("");
    console.log(
      `the copies are ${(((whole.writeMs + whole.readMs) / whole.totalMs) * 100).toFixed(0)}% of the job`,
    );
  };
  void run();
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
