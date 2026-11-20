/**
 * Example 3 - sixty frames, a keyframe every twelve, and what a seek costs.
 *
 *   node chapters/chapter05/files/03_plan_chunks.ts
 *
 * The plan is the encoder's input and the seek bar's contract. A decoder cannot start in the
 * middle of a group of pictures, so a seek to the last frame of a group costs the whole group,
 * and the number of frames in a group is the decision this program makes visible.
 */

import { plannedChunks, seekCost } from "./frames.ts";
import { assertMonotonic } from "./report.ts";

const FPS = 30;
const FRAMES = 60;

export function main(): number {
  for (const keyEvery of [6, 12, 30]) {
    const chunks = plannedChunks(FRAMES, FPS, keyEvery);
    const keys = chunks.filter((chunk) => chunk.key).length;
    const mid = chunks[Math.floor(FRAMES * 0.75)];
    if (!mid) throw new Error("no frame at three quarters");
    const cost = seekCost(chunks, mid.timestampUs);

    console.log(
      `key every ${String(keyEvery).padStart(2)}   ${String(keys).padStart(2)} keyframes   ` +
        `seek to 1.50 s costs ${String(cost.framesToProcess).padStart(2)} frames   ` +
        `last key at ${(chunks[cost.keyIndex]?.timestampUs ?? 0) / 1e6} s`,
    );
  }

  const chunks = plannedChunks(FRAMES, FPS, 12);
  assertMonotonic(chunks.map((chunk) => chunk.timestampUs));

  console.log("");
  console.log(`60 frames at ${FPS} fps = ${(FRAMES / FPS).toFixed(2)} s of media`);
  console.log("first four chunks:");
  for (const chunk of chunks.slice(0, 4)) {
    console.log(
      `  ${String(chunk.timestampUs).padStart(7)} us  ${String(chunk.durationUs).padStart(6)} us  ` +
        `${chunk.key ? "key" : "delta"}`,
    );
  }
  console.log("");
  console.log("a shorter interval is a cheaper scrub and a bigger file; the plan is that trade");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
