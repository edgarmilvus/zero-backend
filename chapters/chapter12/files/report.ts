/**
 * What the chapter prints: the two loads side by side, and one embedding.
 */

import type { FrameStats } from "./frames.ts";

export function renderLoad(label: string, loadMs: number, frames: FrameStats): string {
  return [
    `${label.padEnd(16)} ${loadMs.toFixed(0)} ms to ready`,
    `  longest frame  ${frames.maxGapMs.toFixed(0)} ms over ${frames.frames} frames`,
  ].join("\n");
}

export function renderEmbed(text: string, embedMs: number, dims: number, bytes: number): string {
  return [
    `"${text.slice(0, 56)}"`,
    `  ${dims} dimensions in ${embedMs.toFixed(0)} ms`,
    `  ${(bytes / 1024).toFixed(0)} kB on the wire`,
  ].join("\n");
}

/** The comparison the chapter is about: same work, two threads, one of them draws. */
export function assertWorkerKeepsPainting(worker: FrameStats, main: FrameStats, minimumGapMs = 100): void {
  if (main.maxGapMs < minimumGapMs) {
    throw new Error(`the main thread did not stall: ${main.maxGapMs.toFixed(0)} ms, the fixture proves nothing`);
  }
  if (worker.maxGapMs >= main.maxGapMs / 4) {
    throw new Error(
      `the worker stalled ${worker.maxGapMs.toFixed(0)} ms against the main thread's ${main.maxGapMs.toFixed(0)}`,
    );
  }
}
