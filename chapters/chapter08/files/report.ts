/**
 * What the chapter prints: one line per strategy, and two assertions.
 */

import type { StreamResult } from "./stream.ts";

const PAD = 12;

export function renderRun(label: string, sizeBytes: number, result: StreamResult): string {
  const mbPerSecond = sizeBytes / 1e6 / (result.wallClockMs / 1000);
  return (
    `${label.padEnd(PAD)}${String(result.chunks).padStart(6)} chunks  ` +
    `${(result.largestChunkBytes / 1e6).toFixed(0).padStart(5)} MB each  ` +
    `${result.wallClockMs.toFixed(0).padStart(6)} ms  ` +
    `${mbPerSecond.toFixed(0).padStart(5)} MB/s`
  );
}

/** A job whose largest read exceeds its budget is a job that gets killed, not one that gets slow. */
export function assertBelowBudget(result: StreamResult, budgetBytes: number): void {
  if (result.largestChunkBytes > budgetBytes) {
    throw new Error(`largest read ${result.largestChunkBytes} exceeds the budget ${budgetBytes}`);
  }
}

/**
 * The digest of a chunked read must equal the digest of the whole file.
 *
 * A boundary error — one byte repeated or skipped — produces a wrong digest and a plausible byte
 * count, which is why `chunkedHash` checks the count per chunk and this checks the digest at the end.
 */
export function assertSameDigest(chunked: string, whole: string): void {
  if (chunked !== whole) {
    throw new Error(
      `digest mismatch: chunked ${chunked.slice(0, 16)}... against whole ${whole.slice(0, 16)}...`,
    );
  }
}
