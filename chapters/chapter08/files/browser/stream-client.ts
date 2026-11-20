/**
 * The page: a browser file, read chunk by chunk.
 *
 * `File.slice(from, to)` is the reader, and it is the whole reason this works: a `File` is a handle to
 * bytes the browser may not have in memory, so slicing it costs a reference rather than a copy.
 *
 * The accumulator here counts bytes, because the platform's digest takes a whole buffer and this
 * chapter's subject is the loop rather than the hash. The node half uses SHA-256 through
 * `createHash`, which has the streaming form the browser's does not.
 */

import { chunkedFold } from "../stream.ts";
import type { Reader } from "../stream.ts";
import { planChunks } from "../plan.ts";

export type PageRun = {
  readonly name: string;
  readonly sizeBytes: number;
  readonly chunkMb: number;
  readonly chunks: number;
  readonly bytesRead: number;
  readonly wallClockMs: number;
  readonly megabytesPerSecond: number;
  readonly largestChunkBytes: number;
};

/** A File as a reader: `slice` is free, and the copy happens when the array buffer is asked for. */
export function fileReader(file: File): Reader {
  return {
    size: file.size,
    async read(from: number, to: number): Promise<Uint8Array> {
      return new Uint8Array(await file.slice(from, to).arrayBuffer());
    },
  };
}

export async function runPage(file: File, chunkMb = 64): Promise<PageRun> {
  const chunkBytes = Math.round(chunkMb * 1024 * 1024);
  // The fold's accumulator is whatever the caller brings; here it is the byte count, which is the
  // number that proves every byte of the file passed through the loop.
  const result = await chunkedFold(fileReader(file), chunkBytes, 0, (seen, data) => seen + data.byteLength);
  const plan = planChunks(file.size, chunkBytes);
  const largest = plan.chunks.reduce((best, chunk) => Math.max(best, chunk.to - chunk.from), 0);

  return {
    name: file.name,
    sizeBytes: file.size,
    chunkMb,
    chunks: result.chunks,
    bytesRead: result.value,
    wallClockMs: result.wallClockMs,
    megabytesPerSecond: file.size / 1e6 / (result.wallClockMs / 1000),
    largestChunkBytes: largest,
  };
}

declare global {
  interface Window {
    __stream: () => Promise<PageRun>;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const bar = document.querySelector<HTMLProgressElement>("#bar");
  const input = document.querySelector<HTMLInputElement>("#file");
  let chosen: File | null = null;

  const run = async (): Promise<PageRun> => {
    if (!chosen) throw new Error("choose a file first");
    if (bar) bar.value = 0;
    if (status) status.textContent = `reading ${chosen.name} in chunks...`;
    const result = await runPage(chosen);
    if (bar) bar.value = 1;
    if (status) status.textContent = `${result.chunks} chunks, ${result.bytesRead} bytes read`;
    if (output) {
      output.textContent = [
        `file             ${result.name}`,
        `size             ${result.sizeBytes} bytes`,
        `chunks           ${result.chunks} of ${result.chunkMb} MB`,
        `largest read     ${result.largestChunkBytes} bytes`,
        `bytes read       ${result.bytesRead}`,
        `wall clock       ${result.wallClockMs.toFixed(0)} ms`,
        `throughput       ${result.megabytesPerSecond.toFixed(0)} MB/s`,
      ].join("\n");
    }
    return result;
  };

  window.__stream = run;
  input?.addEventListener("change", () => {
    chosen = input.files?.[0] ?? null;
    if (status && chosen) status.textContent = `${chosen.name}, ${chosen.size} bytes, ready`;
  });
}
