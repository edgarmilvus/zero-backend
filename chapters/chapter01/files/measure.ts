/**
 * The client side of the table, measured.
 *
 * The server column is arithmetic on a tariff. The client column is not: it is a
 * wall clock and a heap size from a real run, in a real process, on a named
 * machine. That asymmetry is the chapter.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type Measurement = {
  /** Bytes the operation actually touched. */
  readonly bytes: number;
  readonly wallClockMs: number;
  readonly peakHeapBytes: number;
  readonly sha256: string;
  readonly source: "measured";
};

/** Hex SHA-256 of a buffer. The upload pipeline's integrity check, and ours. */
export function sha256(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** The file, whole, in memory. A 120 MB reel is the largest case this fits. */
export function readBytes(path: string): Uint8Array {
  return readFileSync(path);
}

/**
 * Heap in use right now. Called before and after the operation, so "peak" means
 * the larger of the two samples plus the buffer the caller handed over: the V8
 * heap does not expose a high-water mark, and pretending otherwise would be the
 * kind of number this book refuses to print.
 */
export function peakHeapBytes(): number {
  return process.memoryUsage().heapUsed;
}

/**
 * One measurement: hash, time, and the heap on both sides.
 *
 * The operation is deliberately boring. It is the part of a media pipeline every
 * client can already do, and its cost is the floor the rest of the book builds on.
 */
export function measureOnce(buffer: Uint8Array): Measurement {
  const before = peakHeapBytes();
  const started = performance.now();
  const digest = sha256(buffer);
  const wallClockMs = performance.now() - started;
  const after = peakHeapBytes();

  return {
    bytes: buffer.byteLength,
    wallClockMs,
    peakHeapBytes: Math.max(before, after, buffer.byteLength),
    sha256: digest,
    source: "measured",
  };
}

/**
 * Read the file off the disk and hash it, timed as one operation.
 *
 * This is the comparable half of the browser measurement: a page that receives a
 * file pays for getting the bytes and for hashing them, so a baseline that only
 * hashes an in-memory buffer would flatter node by the whole read.
 */
export function measureFile(path: string): Measurement {
  const before = peakHeapBytes();
  const started = performance.now();
  const buffer = readBytes(path);
  const digest = sha256(buffer);
  const wallClockMs = performance.now() - started;
  const after = peakHeapBytes();

  return {
    bytes: buffer.byteLength,
    wallClockMs,
    peakHeapBytes: Math.max(before, after, buffer.byteLength),
    sha256: digest,
    source: "measured",
  };
}
