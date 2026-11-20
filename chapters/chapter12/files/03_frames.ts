/**
 * Example 3 - the freeze, as arithmetic.
 *
 *   node chapters/chapter12/files/03_frames.ts
 *
 * Two traces from the same page: the worker keeps a frame every 16 milliseconds, the main thread stops
 * for six hundred. The gap that matters is the one at the end of the window, and a monitor that only
 * looks at recorded frames cannot see it.
 */

import { fps, maxGap, summarize } from "./frames.ts";

/** A trace at sixty frames a second for `ms`, ending at `start`. */
function steady(start: number, ms: number): number[] {
  const stamps: number[] = [];
  for (let at = start + 16.7; at < start + ms; at += 16.7) stamps.push(at);
  return stamps;
}

export function main(): number {
  const workerStart = 0;
  const workerEnd = 1_009;
  const workerFrames = steady(workerStart, workerEnd);

  const mainStart = 0;
  const mainEnd = 860;
  // Frames until 240 ms, then nothing until the load returns: the freeze is the tail.
  const mainFrames = steady(mainStart, 240);

  const worker = summarize(workerFrames, workerStart, workerEnd);
  const main = summarize(mainFrames, mainStart, mainEnd);

  console.log(`worker            ${worker.frames} frames, longest gap ${worker.maxGapMs.toFixed(1)} ms, ${fps(worker, workerEnd).toFixed(0)} fps`);
  console.log(`main thread       ${main.frames} frames, longest gap ${main.maxGapMs.toFixed(1)} ms, ${fps(main, mainEnd).toFixed(0)} fps`);
  console.log("");
  console.log(`the same load, ${(main.maxGapMs / Math.max(1, worker.maxGapMs)).toFixed(0)} times the freeze on the thread that draws`);
  console.log(`a monitor without the end timestamp would report ${maxGap(mainFrames).toFixed(1)} ms and miss all of it`);

  return main.maxGapMs > 500 && worker.maxGapMs < 50 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
