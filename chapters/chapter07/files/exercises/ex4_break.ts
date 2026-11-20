/**
 * Exercise 4 - the silence that never ends.
 *
 * A file that is silent from the first sample gives a trim plan with no content. A pipeline that
 * writes the trimmed result anyway produces a zero-length WAV, and a product that promised to remove
 * silence delivered a file that does not play.
 */

import { findSilence, trimPlan } from "../audio.ts";
import { writeWav } from "../wav.ts";
import { eq, expect, near, type Check } from "./selfcheck.ts";

const RATE = 44100;
const SILENT = new Float32Array(RATE * 2);
const TONE = Float32Array.from({ length: RATE * 2 }, (_, index) =>
  0.5 * Math.sin((2 * Math.PI * 440 * index) / RATE),
);

const OPTIONS = { thresholdDbfs: -50, minMs: 200, marginMs: 100 };

export type Decision = "trim" | "refuse";

/** The bug: trim whatever the plan says, including nothing. */
export function trustThePlan(samples: Float32Array): number {
  const plan = trimPlan(samples, RATE, OPTIONS);
  return plan.toSample - plan.fromSample;
}

/** The repair: a plan that keeps nothing is a refusal, not a result. */
export function decide(samples: Float32Array): { decision: Decision; keptSamples: number; reason: string } {
  const plan = trimPlan(samples, RATE, OPTIONS);
  const kept = plan.toSample - plan.fromSample;
  if (kept <= 0) {
    return {
      decision: "refuse",
      keptSamples: 0,
      reason: "the whole file is below the silence threshold, so there is nothing to keep",
    };
  }
  return { decision: "trim", keptSamples: kept, reason: `keeps ${(kept / RATE).toFixed(2)} s` };
}

export const checks: readonly Check[] = [
  {
    name: "a silent file trims to nothing",
    run: () => eq(trustThePlan(SILENT), 0, "samples"),
  },
  {
    name: "the decision refuses it",
    run: () => eq(decide(SILENT).decision, "refuse", "decision"),
  },
  {
    name: "the refusal says why",
    run: () => expect(decide(SILENT).reason.includes("below the silence threshold"), "reason"),
  },
  {
    name: "a file with a tone is trimmed, not refused",
    run: () => eq(decide(TONE).decision, "trim", "decision"),
  },
  {
    name: "and the trim keeps the whole tone",
    run: () => near(decide(TONE).keptSamples / RATE, 2, 0.01, "kept"),
  },
  {
    name: "the silent file has silence runs from end to end",
    run: () => {
      const runs = findSilence(SILENT, RATE, OPTIONS);
      eq(runs.length, 1, "runs");
      return eq(runs[0]?.startSample, 0, "start");
    },
  },
  {
    name: "a zero-length WAV is still a valid header",
    run: () => {
      const bytes = writeWav({ channels: [new Float32Array(0)], sampleRate: RATE });
      eq(bytes.byteLength, 44, "bytes");
      return eq(new DataView(bytes.buffer).getUint32(40, true), 0, "data size");
    },
  },
  {
    name: "a one-sample file is content, not silence",
    run: () => {
      const decision = decide(new Float32Array([0.5]));
      return eq(decision.decision, "trim", "decision");
    },
  },
  {
    name: "the refusal carries the numbers a UI needs",
    run: () => {
      const decision = decide(SILENT);
      eq(decision.keptSamples, 0, "kept");
      return expect(decision.reason.length > 20, "reason too short");
    },
  },
];

export function main(): number {
  console.log(`silent file    ${trustThePlan(SILENT)} samples kept`);
  console.log(`decision       ${decide(SILENT).decision}: ${decide(SILENT).reason}`);
  console.log(`tone file      ${decide(TONE).decision}, ${decide(TONE).keptSamples} samples`);
  console.log("");
  console.log("a trim that keeps nothing is a refusal, and a refusal is a message rather than a zero-byte file");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
