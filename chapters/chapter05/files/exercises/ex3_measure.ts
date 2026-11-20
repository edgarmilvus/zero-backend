/**
 * Exercise 3 - the encoder that is fast until it is asked for a keyframe.
 *
 * A frame is not a frame. A delta frame carries the difference from its neighbours; a keyframe
 * carries the whole picture, so it costs several times more to encode and several times more to
 * store. A scrub bar built on "the encode takes 30 ms" assumes every frame costs the same, and the
 * first seek lands on a keyframe and takes ten times longer.
 */

import { plannedChunks } from "../frames.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

/** The measured cost model: a keyframe is `factor` times a delta frame. */
export type CostModel = {
  readonly deltaMs: number;
  readonly keyFactor: number;
};

export function encodeCost(
  frameCount: number,
  fps: number,
  keyEvery: number,
  model: CostModel,
): { readonly totalMs: number; readonly keyMs: number; readonly keys: number } {
  const chunks = plannedChunks(frameCount, fps, keyEvery);
  const keys = chunks.filter((chunk) => chunk.key).length;
  const keyMs = keys * model.deltaMs * model.keyFactor;
  const deltaMs = (chunks.length - keys) * model.deltaMs;
  return { totalMs: keyMs + deltaMs, keyMs, keys };
}

const MODEL: CostModel = { deltaMs: 1, keyFactor: 8 };

export const checks: readonly Check[] = [
  {
    name: "a keyframe costs eight delta frames in this model",
    run: () => {
      const one = encodeCost(12, 30, 12, MODEL);
      return eq(one.keyMs / one.keys, 8, "per key");
    },
  },
  {
    name: "thirty keys over sixty frames cost more than five",
    run: () => {
      const many = encodeCost(60, 30, 2, MODEL);
      const few = encodeCost(60, 30, 12, MODEL);
      return expect(many.totalMs > few.totalMs, `${many.totalMs} vs ${few.totalMs}`);
    },
  },
  {
    name: "the keyframe share grows as the interval shrinks",
    run: () => {
      const share = (keyEvery: number): number => {
        const cost = encodeCost(60, 30, keyEvery, MODEL);
        return cost.keyMs / cost.totalMs;
      };
      return expect(share(2) > share(30), "share did not grow");
    },
  },
  {
    name: "an interval of one is all keyframes",
    run: () => {
      const cost = encodeCost(10, 30, 1, MODEL);
      return eq(cost.keys, 10, "keys");
    },
  },
  {
    name: "an interval longer than the clip is one keyframe",
    run: () => eq(encodeCost(10, 30, 99, MODEL).keys, 1, "keys"),
  },
  {
    name: "the total is the sum of both kinds",
    run: () => {
      const cost = encodeCost(24, 30, 12, MODEL);
      const deltas = (24 - cost.keys) * MODEL.deltaMs;
      return eq(cost.totalMs, cost.keyMs + deltas, "total");
    },
  },
  {
    name: "a cheaper keyframe narrows the gap between the plans",
    run: () => {
      const cheap: CostModel = { deltaMs: 1, keyFactor: 2 };
      const a = encodeCost(60, 30, 2, cheap).totalMs;
      const b = encodeCost(60, 30, 12, cheap).totalMs;
      const expensiveA = encodeCost(60, 30, 2, MODEL).totalMs;
      const expensiveB = encodeCost(60, 30, 12, MODEL).totalMs;
      return expect(Math.abs(a - b) < Math.abs(expensiveA - expensiveB), "gap did not narrow");
    },
  },
  {
    name: "zero frames cost nothing",
    run: () => eq(encodeCost(0, 30, 12, MODEL).totalMs, 0, "cost"),
  },
  {
    name: "the model is linear in the frame count",
    run: () => {
      const one = encodeCost(12, 30, 12, MODEL).totalMs;
      const two = encodeCost(24, 30, 12, MODEL).totalMs;
      return expect(two > one * 1.5, `${two} vs ${one}`);
    },
  },
  {
    name: "a seek to a keyframe is the cheap case, and it is one frame",
    run: () => {
      const chunks = plannedChunks(36, 30, 12);
      const key = chunks[24];
      if (!key) throw new Error("no keyframe at 24");
      return eq(key.key, true, "key");
    },
  },
];

export function main(): number {
  for (const keyEvery of [2, 6, 12, 30]) {
    const cost = encodeCost(60, 30, keyEvery, MODEL);
    console.log(
      `key every ${String(keyEvery).padStart(2)}   ${String(cost.keys).padStart(2)} keys   ` +
        `total ${String(cost.totalMs).padStart(3)} ms   key share ${(
          (cost.keyMs / cost.totalMs) * 100
        ).toFixed(0)}%`,
    );
  }
  console.log("");
  console.log("the interval is a seek cost and an encode cost, and the plan is the trade");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
