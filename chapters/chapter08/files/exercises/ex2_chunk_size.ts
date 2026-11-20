/**
 * Exercise 2 - the chunk size that fits memory and not the syscall.
 *
 * A 4 kB chunk keeps memory flat and turns a one-second hash into a minute, because the cost is the
 * call and not the byte. This exercise models both costs and finds the size where the sum is lowest.
 */

import { eq, expect, near, type Check } from "./selfcheck.ts";

export type Cost = {
  /** Milliseconds per read call, whatever its size. */
  readonly callMs: number;
  /** Milliseconds per megabyte of bytes read. */
  readonly perMbMs: number;
  /** Milliseconds per megabyte held: cache pressure, and the GC the buffer causes. */
  readonly memoryMsPerMb: number;
};

export const DISK: Cost = { callMs: 0.004, perMbMs: 0.6, memoryMsPerMb: 0.2 };

/**
 * The model: the calls, the transfer, and the memory the chunk occupies while it is alive.
 *
 * Without the third term the cheapest chunk is the largest one, which is exactly the mistake the
 * exercise is about: memory has a price and the model has to say so.
 */
export function totalMs(sizeBytes: number, chunkBytes: number, cost: Cost): number {
  if (!Number.isFinite(chunkBytes) || chunkBytes <= 0) {
    throw new Error(`chunk: expected a positive size, got ${chunkBytes}`);
  }
  const calls = Math.ceil(sizeBytes / chunkBytes);
  const megabytes = sizeBytes / 1e6;
  return calls * cost.callMs + megabytes * cost.perMbMs + (chunkBytes / 1e6) * cost.memoryMsPerMb;
}

/** Where the call cost and the memory cost cross: sqrt(bytes times call over memory per megabyte). */
export function optimalChunk(sizeBytes: number, cost: Cost): number {
  return Math.sqrt((sizeBytes * cost.callMs) / (cost.memoryMsPerMb / 1e6));
}

const SIZE = 1e9;

export const checks: readonly Check[] = [
  {
    name: "a 4 kB chunk makes a quarter of a million calls",
    run: () => eq(Math.ceil(SIZE / (4 * 1024)), 244_141, "calls"),
  },
  {
    name: "and the calls cost more than the transfer",
    run: () => {
      const calls = (SIZE / (4 * 1024)) * DISK.callMs;
      const transfer = (SIZE / 1e6) * DISK.perMbMs;
      return expect(calls > transfer, `${calls} vs ${transfer}`);
    },
  },
  {
    name: "a 64 MB chunk makes fifteen calls",
    run: () => eq(Math.ceil(SIZE / (64 * 1024 ** 2)), 15, "calls"),
  },
  {
    name: "the modelled optimum lands in the megabytes",
    run: () => {
      const best = optimalChunk(SIZE, DISK);
      return expect(best > 1e5 && best < 1e8, `${best}`);
    },
  },
  {
    name: "the optimum is cheaper than 4 kB",
    run: () =>
      expect(totalMs(SIZE, optimalChunk(SIZE, DISK), DISK) < totalMs(SIZE, 4096, DISK), "not cheaper"),
  },
  {
    name: "the optimum is cheaper than 256 MB",
    run: () =>
      expect(
        totalMs(SIZE, optimalChunk(SIZE, DISK), DISK) < totalMs(SIZE, 256 * 1024 ** 2, DISK),
        "not cheaper",
      ),
  },
  {
    name: "doubling the chunk halves the calls",
    run: () => {
      const a = Math.ceil(SIZE / (16 * 1024 ** 2));
      const b = Math.ceil(SIZE / (32 * 1024 ** 2));
      return near(a / b, 2, 0.05, "ratio");
    },
  },
  {
    name: "a zero chunk size is refused by the model",
    run: () => {
      try {
        totalMs(SIZE, 0, DISK);
        return false;
      } catch {
        return true;
      }
    },
  },
  {
    name: "a faster disk pushes the optimum down",
    run: () => {
      const fast: Cost = { callMs: 0.001, perMbMs: 0.6, memoryMsPerMb: 0.2 };
      return expect(optimalChunk(SIZE, fast) < optimalChunk(SIZE, DISK), "not lower");
    },
  },
];

export function main(): number {
  for (const chunkMb of [0.004, 1, 8, 64, 256]) {
    const chunkBytes = chunkMb * 1024 ** 2;
    console.log(
      `${`${chunkMb} MB`.padStart(9)}  ${String(Math.ceil(SIZE / chunkBytes)).padStart(8)} calls  ` +
        `${totalMs(SIZE, chunkBytes, DISK).toFixed(0).padStart(5)} ms modelled`,
    );
  }
  console.log("");
  console.log(`the optimum under this model is ${(optimalChunk(SIZE, DISK) / 1024 ** 2).toFixed(1)} MB`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
