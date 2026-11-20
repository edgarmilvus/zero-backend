/**
 * The plan: a size, a budget, and the chunks that fit between them.
 *
 * Nothing here reads a file. The plan is arithmetic, which is why the chapter can refuse an
 * impossible job before it opens one, and why the same plan describes a node stream and a browser
 * `File.slice`.
 */

/** The wall a 32-bit WebAssembly instance hits: 65,536 pages of 64 KiB. */
export const ADDRESS_SPACE_BYTES = 4 * 1024 ** 3;

export type AddressSpace = {
  /** What the runtime can address. 4 GiB in a single wasm instance. */
  readonly limitBytes: number;
  /** What this job may use, which is always less: the rest holds the runtime itself. */
  readonly budgetBytes: number;
};

export type Chunk = {
  readonly index: number;
  /** Inclusive. */
  readonly from: number;
  /** Exclusive, which is the convention every slice in this book uses. */
  readonly to: number;
};

export type Plan = {
  readonly sizeBytes: number;
  readonly chunkBytes: number;
  readonly chunks: readonly Chunk[];
  /** How many bytes the job holds at once: the chunk, plus the copy the reader returns. */
  readonly peakBytes: number;
};

export type Refusal = {
  readonly reason: string;
  readonly ceiling: string;
  readonly fallbackChapter: number;
};

/** The peak a whole-file strategy needs: the file, its output, and the runtime around them. */
export function estimatePeakBytes(sizeBytes: number, copies = 2): number {
  return sizeBytes * copies;
}

/**
 * Chunks that cover a file exactly, with a partial last chunk.
 *
 * The last chunk is where it goes wrong: `size % chunkBytes` is zero for a file that divides evenly,
 * and a plan that emits a zero-byte chunk at the end is a plan with a phantom read.
 */
export function planChunks(sizeBytes: number, chunkBytes: number): Plan {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new Error(`size: expected a non-negative number, got ${sizeBytes}`);
  }
  if (!Number.isInteger(chunkBytes) || chunkBytes < 1) {
    throw new Error(`chunk: expected a positive integer, got ${chunkBytes}`);
  }

  const chunks: Chunk[] = [];
  let index = 0;
  for (let at = 0; at < sizeBytes; at += chunkBytes) {
    chunks.push({ index, from: at, to: Math.min(at + chunkBytes, sizeBytes) });
    index += 1;
  }

  return {
    sizeBytes,
    chunkBytes,
    chunks,
    peakBytes: Math.min(sizeBytes, chunkBytes) * 2,
  };
}

/**
 * The refusal, taken before the file is opened.
 *
 * A 6 GB file in a 4 GiB address space is not slow, it is impossible, and the message names which of
 * the two obstacles stopped it: the address space, or the budget this page was given.
 */
export function refuseIfTooBig(sizeBytes: number, space: AddressSpace): Refusal | null {
  if (sizeBytes > space.limitBytes) {
    return {
      reason: `the file is ${(sizeBytes / 1e9).toFixed(1)} GB and the address space is ${(
        space.limitBytes / 1e9
      ).toFixed(0)} GB`,
      ceiling: "a 32-bit WebAssembly instance addresses four gigabytes, and nothing raises it",
      fallbackChapter: 8,
    };
  }

  if (estimatePeakBytes(sizeBytes) > space.budgetBytes) {
    return {
      reason: `holding it whole needs about ${(estimatePeakBytes(sizeBytes) / 1e9).toFixed(1)} GB and this job may use ${(
        space.budgetBytes / 1e9
      ).toFixed(1)} GB`,
      ceiling: "the memory budget the page was given, which a tab can be killed for exceeding",
      fallbackChapter: 8,
    };
  }

  return null;
}
