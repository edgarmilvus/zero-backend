/**
 * Example 5 - produce a measurement, and write it down.
 *
 * The operation is the one every media pipeline performs before it trusts a file:
 * read all of it, hash all of it, and say how long that took and how much memory
 * it held. The output is a record, not a sentence.
 *
 *   node chapters/chapter01/files/05_hash_the_file.ts
 *   node chapters/chapter01/files/05_hash_the_file.ts path/to/reel.mp4
 *   node chapters/chapter01/files/05_hash_the_file.ts --write
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cpus, platform, release, totalmem } from "node:os";
import { BYTES } from "./tariff.ts";
import { megabytes } from "./ledger.ts";
import { measureFile, measureOnce, type Measurement } from "./measure.ts";

export const NODE_RECORD = "runs/chapter01/reel-120mb-node/record.json";

/**
 * A deterministic buffer, so two readers on two machines hash the same bytes.
 * Twelve hundred thousand kilobytes is the one thing this chapter must hold in
 * memory at once; the file is never written, because the input is not the point.
 */
function generated(sizeBytes: number): Uint8Array {
  const buffer = new Uint8Array(sizeBytes);
  let state = 0x9e3779b9;
  for (let i = 0; i < buffer.length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    buffer[i] = state >>> 24;
  }
  return buffer;
}

function recordOf(
  measurement: Measurement,
  input: { name: string; bytes: number; sha256: string },
): Record<string, unknown> {
  return {
    id: "reel-120mb",
    chapter: 1,
    workload: "reel-120mb",
    engine: "node",
    measuredAt: new Date().toISOString(),
    machine: {
      model: cpus()[0]?.model ?? "unknown",
      cores: cpus().length,
      totalMemBytes: totalmem(),
    },
    os: `${platform()} ${release()}`,
    browser: null,
    runtime: { name: "node", version: process.version },
    packages: { lockfile: "none", sha256: null },
    input,
    result: {
      wallClockMs: measurement.wallClockMs,
      peakHeapBytes: measurement.peakHeapBytes,
      sha256: measurement.sha256,
    },
    notes: "read + hash: the floor every client can already do",
  };
}

export function main(argv: readonly string[]): number {
  const positional: string[] = [];
  let sizeMb = 120;
  let name: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--size") {
      sizeMb = Number(argv[i + 1] ?? 120);
      i += 1;
    } else if (arg === "--name") {
      name = argv[i + 1] ?? null;
      i += 1;
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }
  const path = positional[0] ?? null;

  const measurement = path ? measureFile(path) : measureOnce(generated(sizeMb * BYTES.MB));
  const inputSha = measurement.sha256;

  const record = recordOf(measurement, {
    name: name ?? path ?? `generated:${sizeMb}MB`,
    bytes: measurement.bytes,
    sha256: inputSha,
  });

  console.log(`input            ${name ?? path ?? `generated ${sizeMb} MB`}`);
  console.log(`bytes            ${measurement.bytes} (${megabytes(measurement.bytes)})`);
  console.log(`sha256           ${inputSha}`);
  console.log(`wall clock       ${measurement.wallClockMs.toFixed(1)} ms`);
  console.log(`peak heap        ${measurement.peakHeapBytes} bytes`);
  console.log(`timed            ${path ? "read + hash" : "hash only (buffer already in memory)"}`);

  if (argv.includes("--write")) {
    mkdirSync(dirname(NODE_RECORD), { recursive: true });
    writeFileSync(NODE_RECORD, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`record           ${NODE_RECORD}`);
  } else {
    console.log("");
    console.log(JSON.stringify(record, null, 2));
  }

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
