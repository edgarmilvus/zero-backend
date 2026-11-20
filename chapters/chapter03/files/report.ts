/**
 * What the chapter prints: an inventory, a throughput, and two checks that keep a port honest.
 *
 * The two assertions are the interesting part. `assertPortParity` runs the same script against
 * two stores and requires the same answer, which is what "interchangeable" means. And
 * `assertNoMainThreadWork` refuses a timing report where the long tasks and the job time
 * disagree, which is the defect exercise 3 is built on.
 */

import type { Entry } from "./storage.ts";

const PAD = 30;

/** The inventory as a terminal table, one line per file, sorted. */
export function renderInventory(entries: readonly Entry[]): string {
  const lines = [
    `${"file".padEnd(PAD)}${"bytes".padStart(10)}  modified`,
    `${"-".repeat(PAD)}${"-".repeat(10)}  --------`,
  ];
  for (const entry of entries) {
    lines.push(
      `${entry.name.padEnd(PAD)}${String(entry.bytes).padStart(10)}  ${new Date(
        entry.modifiedMs,
      )
        .toISOString()
        .slice(11, 19)}`,
    );
  }
  lines.push("");
  lines.push(
    `${String(entries.length).padStart(3)} files, ${entries
      .reduce((sum, entry) => sum + entry.bytes, 0)
      .toLocaleString("en-US")} bytes`,
  );
  return lines.join("\n");
}

/**
 * The throughput a reader can compare across machines: bytes, milliseconds, megabytes a second.
 *
 * The wall clock includes the write and the flush, because a number that excludes the flush is
 * a number about memory rather than about the disk.
 */
export function renderThroughput(
  label: string,
  bytes: number,
  wallClockMs: number,
): string {
  const mbPerSecond = wallClockMs === 0 ? Number.POSITIVE_INFINITY : bytes / 1e6 / (wallClockMs / 1000);
  const rate = Number.isFinite(mbPerSecond) ? `${mbPerSecond.toFixed(1)} MB/s` : "unmeasured";
  return `${label.padEnd(PAD)}${String(bytes).padStart(10)} bytes  ${String(
    wallClockMs.toFixed(1),
  ).padStart(9)} ms  ${rate}`;
}

/**
 * The same script against two stores must produce the same inventory.
 *
 * This is what "a port" means, and it is the assertion that catches an adapter which quietly
 * drops a field: OPFS reports a real `lastModified`, a memory store reports the clock at write
 * time, and a comparison that includes the timestamp would always fail for the wrong reason.
 */
export function assertPortParity(
  left: readonly Entry[],
  right: readonly Entry[],
): void {
  const shape = (entries: readonly Entry[]): string =>
    entries.map((entry) => `${entry.name}:${entry.bytes}:${entry.kind}`).join(",");

  if (shape(left) !== shape(right)) {
    throw new Error(
      `the two stores disagree:\n  left  ${shape(left)}\n  right ${shape(right)}`,
    );
  }
}

/**
 * Refuses a timing report whose parts do not add up.
 *
 * A page that says "the job took 40 ms" while the event loop was blocked for 900 ms has
 * measured something other than the job, and the two numbers disagreeing is the only evidence
 * a reader gets without a profiler.
 */
export function assertNoMainThreadWork(report: {
  readonly jobMs: number;
  readonly mainThreadBlockedMs: number;
  readonly budgetMs: number;
}): void {
  if (report.mainThreadBlockedMs > report.budgetMs) {
    throw new Error(
      `the main thread was blocked for ${report.mainThreadBlockedMs} ms, budget ${report.budgetMs} ms`,
    );
  }
  if (report.jobMs < report.mainThreadBlockedMs / 2) {
    throw new Error(
      `job ${report.jobMs} ms is too short to explain ${report.mainThreadBlockedMs} ms of blocking`,
    );
  }
}
