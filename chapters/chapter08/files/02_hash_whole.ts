/**
 * Example 2 - the whole file, in one buffer.
 *
 *   node chapters/chapter08/files/02_hash_whole.ts <path>
 *
 * `readFileSync` allocates the file and returns it, so the process holds one gigabyte to hash one
 * gigabyte. The number this prints is not the heap a profiler shows: it is RSS, because a Buffer of
 * a gigabyte lives outside it.
 */

import { readFileSync, statSync } from "node:fs";

import { createHash } from "node:crypto";

function mib(bytes: number): string {
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function main(argv: readonly string[] = []): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: 02_hash_whole.ts <path>");
    return 2;
  }

  const size = statSync(path).size;
  const before = process.memoryUsage();

  const started = performance.now();
  const bytes = readFileSync(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const wallClockMs = performance.now() - started;
  const after = process.memoryUsage();

  console.log(`file             ${path}, ${mib(size)}`);
  console.log(`digest           ${digest.slice(0, 16)}...`);
  console.log(`wall clock       ${wallClockMs.toFixed(0)} ms (${(size / 1e6 / (wallClockMs / 1000)).toFixed(0)} MB/s)`);
  console.log(`rss before       ${mib(before.rss)}`);
  console.log(`rss after        ${mib(after.rss)}`);
  console.log(`rss growth       ${mib(after.rss - before.rss)}`);
  console.log("");
  console.log("one buffer, one digest, and the process is as large as the file for as long as it runs");

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
