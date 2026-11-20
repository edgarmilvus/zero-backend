/**
 * The reader is injected, so the same loop works on a node stream and a browser slice.
 *
 * A chunked job is a for-loop over ranges plus one accumulator, and the accumulator is the whole
 * trick: a hash updates incrementally, so the digest of a gigabyte costs the memory of one chunk.
 */

import { planChunks, type Chunk, type Plan } from "./plan.ts";

/** Everything the loop needs from wherever the bytes come from. */
export type Reader = {
  readonly size: number;
  /** Bytes in `[from, to)`, and nothing else. */
  read(from: number, to: number): Uint8Array | Promise<Uint8Array>;
};

export type StreamResult = {
  readonly digest: string;
  readonly bytes: number;
  readonly chunks: number;
  readonly wallClockMs: number;
  /** The largest single read, which is the memory the job actually held. */
  readonly largestChunkBytes: number;
  readonly plan: Plan;
};

/**
 * Hashes a reader in chunks, and never asks for more than one at a time.
 *
 * The `await` inside the loop is not decoration: it is what lets the reader apply its own flow
 * control. A version that collected the promises and awaited them afterwards would hold every chunk
 * at once, which is a chunked job with the memory of a whole-file job.
 */
export async function chunkedHash(reader: Reader, chunkBytes: number): Promise<StreamResult> {
  // Imported here rather than at the top, so this module can also be loaded by a page: a browser has
  // no `node:crypto`, and the loop below is the part it needs.
  const { createHash } = await import("node:crypto");

  const plan = planChunks(reader.size, chunkBytes);
  const hash = createHash("sha256");
  const started = performance.now();
  let bytes = 0;
  let largest = 0;

  for (const chunk of plan.chunks) {
    const data = await reader.read(chunk.from, chunk.to);
    const expected = chunk.to - chunk.from;
    if (data.byteLength !== expected) {
      throw new Error(
        `chunk ${chunk.index}: asked for ${expected} bytes and the reader returned ${data.byteLength}`,
      );
    }
    hash.update(data);
    bytes += data.byteLength;
    largest = Math.max(largest, data.byteLength);
  }

  return {
    digest: hash.digest("hex"),
    bytes,
    chunks: plan.chunks.length,
    wallClockMs: performance.now() - started,
    largestChunkBytes: largest,
    plan,
  };
}

/**
 * The loop with any accumulator, which is what a browser can use.
 *
 * `SubtleCrypto.digest` takes a whole buffer and returns a promise: there is no streaming digest in
 * the platform. A page that wants a chunked digest therefore brings its own accumulator — a checksum,
 * or a hand-written SHA-256 — and this function is the loop it plugs into.
 */
export async function chunkedFold<T>(
  reader: Reader,
  chunkBytes: number,
  initial: T,
  step: (state: T, data: Uint8Array, chunk: Chunk) => T,
): Promise<{ readonly value: T; readonly bytes: number; readonly chunks: number; readonly wallClockMs: number }> {
  const plan = planChunks(reader.size, chunkBytes);
  const started = performance.now();
  let state = initial;
  let bytes = 0;

  for (const chunk of plan.chunks) {
    const data = await reader.read(chunk.from, chunk.to);
    if (data.byteLength !== chunk.to - chunk.from) {
      throw new Error(`chunk ${chunk.index}: the reader returned the wrong number of bytes`);
    }
    state = step(state, data, chunk);
    bytes += data.byteLength;
  }

  return { value: state, bytes, chunks: plan.chunks.length, wallClockMs: performance.now() - started };
}

/** The same loop, for a caller that wants each chunk rather than a digest. */
export async function forEachChunk(
  reader: Reader,
  chunkBytes: number,
  visit: (chunk: Chunk, data: Uint8Array) => void | Promise<void>,
): Promise<number> {
  const plan = planChunks(reader.size, chunkBytes);
  let seen = 0;
  for (const chunk of plan.chunks) {
    const data = await reader.read(chunk.from, chunk.to);
    await visit(chunk, data);
    seen += data.byteLength;
  }
  return seen;
}
