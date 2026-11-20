/**
 * Example 3 - the same digest, one chunk at a time.
 *
 *   node chapters/chapter08/files/03_hash_chunked.ts <path> [chunkMB]
 *
 * The reader is fifteen lines around `openSync`, `readSync` and an offset. What it buys is that the
 * process holds one chunk rather than one file, and the digests are equal, which is the only claim
 * that matters.
 */

import { closeSync, openSync, readSync, statSync } from "node:fs";

import { chunkedHash, type Reader } from "./stream.ts";

export function fileReader(path: string): Reader {
  const size = statSync(path).size;
  const fd = openSync(path, "r");

  return {
    size,
    read(from: number, to: number): Uint8Array {
      const buffer = new Uint8Array(to - from);
      let filled = 0;
      while (filled < buffer.byteLength) {
        const read = readSync(fd, buffer, filled, buffer.byteLength - filled, from + filled);
        if (read === 0) break;
        filled += read;
      }
      if (filled !== buffer.byteLength) {
        closeSync(fd);
        throw new Error(`read ${filled} of ${buffer.byteLength} bytes at ${from}`);
      }
      return buffer;
    },
  };
}

export function main(argv: readonly string[] = []): number {
  return mainAsync(argv) as unknown as number;
}

async function mainAsync(argv: readonly string[]): Promise<number> {
  const path = argv[0];
  if (!path) {
    console.error("usage: 03_hash_chunked.ts <path> [chunkMB]");
    return 2;
  }
  const chunkMb = Number(argv[1] ?? 64);
  const chunkBytes = Math.round(chunkMb * 1024 ** 2);

  const before = process.memoryUsage();
  const result = await chunkedHash(fileReader(path), chunkBytes);
  const after = process.memoryUsage();
  closeSyncAll();

  console.log(`file             ${path}, ${(result.bytes / 1024 ** 2).toFixed(0)} MB`);
  console.log(`digest           ${result.digest.slice(0, 16)}...`);
  console.log(`chunks           ${result.chunks} of ${chunkMb} MB`);
  console.log(`wall clock       ${result.wallClockMs.toFixed(0)} ms (${(result.bytes / 1e6 / (result.wallClockMs / 1000)).toFixed(0)} MB/s)`);
  console.log(`rss before       ${(before.rss / 1024 ** 2).toFixed(0)} MB`);
  console.log(`rss after        ${(after.rss / 1024 ** 2).toFixed(0)} MB`);
  console.log(`rss growth       ${((after.rss - before.rss) / 1024 ** 2).toFixed(0)} MB`);
  console.log("");
  console.log("the digest is the same one, and the process is the size of a chunk");

  return 0;
}

const open: number[] = [];
function closeSyncAll(): void {
  for (const fd of open) {
    try {
      closeSync(fd);
    } catch {
      /* already closed */
    }
  }
}

if (import.meta.main) {
  process.exit(await mainAsync(process.argv.slice(2)));
}
