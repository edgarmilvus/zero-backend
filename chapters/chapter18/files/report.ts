/**
 * What the chapter prints, and the two assertions a pool test needs.
 */

import type { PoolStats } from "./pool.ts";
import type { Summary } from "./metrics.ts";

export function renderStats(stats: PoolStats): string {
  return [
    `workers           ${stats.workers}`,
    `running           ${stats.running}`,
    `queued            ${stats.queued}`,
    `done              ${stats.done}, ${stats.failed} failed`,
    `longest wait      ${stats.longestWaitMs} ms`,
  ].join("\n");
}

export function renderRun(label: string, summary: Summary, frameMs: number): string {
  return [
    `${label.padEnd(10)} ${String(summary.count).padStart(4)} tasks, ${summary.totalMs} ms total`,
    `  p50 ${summary.p50} ms, p95 ${summary.p95} ms, longest ${summary.max} ms`,
    `  longest frame ${frameMs} ms`,
  ].join("\n");
}

/** A pool that stalls the frame is a pool that did not do its job. */
export function assertFrame(frameMs: number, budgetMs = 100): void {
  if (!(frameMs >= 0)) throw new Error(`frame: ${frameMs} is not a duration`);
  if (frameMs > budgetMs) throw new Error(`frame: the longest gap was ${frameMs} ms against a ${budgetMs} ms budget`);
}

/** A queue that never drains is a producer that outran the pool. */
export function assertQueued(stats: PoolStats, expected = 0): void {
  if (stats.queued !== expected) throw new Error(`queue: ${stats.queued} left, expected ${expected}`);
}
