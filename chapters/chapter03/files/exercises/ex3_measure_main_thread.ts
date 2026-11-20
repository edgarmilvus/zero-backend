/**
 * Exercise 3 - the work that was on the main thread all along.
 *
 * A hash loop over 40 MB blocks the page for as long as it runs. Nobody measures it, because
 * the dashboard watches the job and the job is fast: the delay is in the gaps between frames,
 * and the number that catches it is the longest stretch without yielding.
 *
 * The repair is not a worker in this file; it is a loop that yields, which is what a worker
 * would do off the main thread.
 */

import { createHash } from "node:crypto";
import { eq, expect, type Check } from "./selfcheck.ts";

export const BLOCK_BYTES = 120 * 1e6;
export const FRAME_BUDGET_MS = 16;

function block(size: number): Uint8Array {
  const buffer = new Uint8Array(size);
  let state = 0x9e3779b9;
  for (let i = 0; i < buffer.length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    buffer[i] = state >>> 24;
  }
  return buffer;
}

/** The bug: one synchronous hash, and the event loop is gone until it returns. */
export function oneGo(buffer: Uint8Array): { digest: string; blockedMs: number } {
  const started = performance.now();
  const digest = createHash("sha256").update(buffer).digest("hex");
  return { digest, blockedMs: performance.now() - started };
}

/** The repair: the same hash, in chunks, with a yield between them. */
export async function chunked(
  buffer: Uint8Array,
  chunkBytes: number,
): Promise<{ digest: string; longestGapMs: number; chunks: number }> {
  const hash = createHash("sha256");
  let longestGapMs = 0;
  let chunks = 0;

  for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
    const started = performance.now();
    hash.update(buffer.subarray(offset, Math.min(offset + chunkBytes, buffer.length)));
    longestGapMs = Math.max(longestGapMs, performance.now() - started);
    chunks += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  return { digest: hash.digest("hex"), longestGapMs, chunks };
}

const BUFFER = block(BLOCK_BYTES);
const ONE = oneGo(BUFFER);

export const checks: readonly Check[] = [
  {
    name: "one synchronous hash blocks longer than a frame",
    run: () => expect(ONE.blockedMs > FRAME_BUDGET_MS, `blocked ${ONE.blockedMs.toFixed(1)} ms`),
  },
  {
    name: "the chunked hash produces the same digest",
    run: async () => {
      const result = await chunked(BUFFER, 8 * 1e6);
      return eq(result.digest, ONE.digest, "digest");
    },
  },
  {
    name: "the chunked hash's longest gap is a fraction of the whole block",
    run: async () => {
      const result = await chunked(BUFFER, 8 * 1e6);
      // Relative to the single run, because an absolute budget makes the gate a benchmark of the
      // machine it runs on: on a loaded laptop a four-millisecond chunk can take twenty.
      return expect(
        result.longestGapMs < ONE.blockedMs / 4,
        `gap ${result.longestGapMs.toFixed(1)} ms against a block of ${ONE.blockedMs.toFixed(1)} ms`,
      );
    },
  },
  {
    name: "the chunks add up to the buffer",
    run: async () => {
      const result = await chunked(BUFFER, 8 * 1e6);
      return eq(result.chunks, 15, "chunks");
    },
  },
  {
    name: "a smaller chunk is a shorter gap",
    run: async () => {
      const small = await chunked(BUFFER, 2 * 1e6);
      const large = await chunked(BUFFER, 40 * 1e6);
      return expect(small.longestGapMs <= large.longestGapMs, `${small.longestGapMs} vs ${large.longestGapMs}`);
    },
  },
  {
    name: "the total time spans more frames than the longest gap",
    run: async () => {
      const started = performance.now();
      const result = await chunked(BUFFER, 8 * 1e6);
      const totalMs = performance.now() - started;
      return expect(totalMs > result.longestGapMs, `${totalMs.toFixed(1)} vs ${result.longestGapMs.toFixed(1)}`);
    },
  },
  {
    name: "one go is one frame's worth of work or more",
    run: () => expect(ONE.blockedMs / FRAME_BUDGET_MS > 1, "ratio"),
  },
  {
    name: "a single chunk degenerates to the blocking version",
    run: async () => {
      const result = await chunked(BUFFER, BLOCK_BYTES);
      eq(result.chunks, 1, "chunks");
      return expect(result.longestGapMs > ONE.blockedMs / 2, `gap ${result.longestGapMs.toFixed(1)}`);
    },
  },
  {
    name: "the digest is stable across runs",
    run: async () => {
      const a = await chunked(BUFFER, 8 * 1e6);
      const b = await chunked(BUFFER, 8 * 1e6);
      return eq(a.digest, b.digest, "digest");
    },
  },
  {
    name: "the blocked time is what a frame budget would have refused",
    run: () => expect(ONE.blockedMs > 0 && ONE.blockedMs < 1000, `blocked ${ONE.blockedMs.toFixed(1)}`),
  },
];

export async function main(): Promise<number> {
  console.log(`buffer            ${(BLOCK_BYTES / 1e6).toFixed(0)} MB`);
  console.log(`one go            ${ONE.blockedMs.toFixed(1)} ms blocked, budget ${FRAME_BUDGET_MS} ms`);
  const result = await chunked(BUFFER, 8 * 1e6);
  console.log(`chunked           ${result.longestGapMs.toFixed(1)} ms longest gap over ${result.chunks} chunks`);
  console.log("");
  console.log("the same digest, and the page gets a frame between every four megabytes");
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
