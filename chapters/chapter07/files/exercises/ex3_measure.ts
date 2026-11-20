/**
 * Exercise 3 - the loudness that a silent minute drags down.
 *
 * An integrated loudness of a podcast with a silent minute reads four units low, because the silence
 * was averaged in. The gate exists for exactly this, and a meter without one tells a producer their
 * show is quieter than it is.
 */

import { loudnessLufs } from "../audio.ts";
import { eq, expect, near, type Check } from "./selfcheck.ts";

const RATE = 44100;

/** A second of tone at `amplitude`, so the expected loudness is known. */
export function tone(amplitude: number, seconds: number): Float32Array {
  return Float32Array.from({ length: Math.round(RATE * seconds) }, (_, index) =>
    amplitude * Math.sin((2 * Math.PI * 440 * index) / RATE),
  );
}

export function concat(...parts: readonly Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const SPEECH = tone(0.5, 2);
const SILENCE = new Float32Array(RATE * 2);
const SPEECH_AND_SILENCE = concat(SPEECH, SILENCE);

export const checks: readonly Check[] = [
  {
    name: "the tone alone reads near minus ten",
    run: () => near(loudnessLufs(SPEECH, RATE).integrated, -9.7, 0.4, "lufs"),
  },
  {
    name: "adding silence barely moves the gated number",
    run: () => {
      const a = loudnessLufs(SPEECH, RATE).integrated;
      const b = loudnessLufs(SPEECH_AND_SILENCE, RATE).integrated;
      return expect(Math.abs(a - b) < 0.5, `${a} vs ${b}`);
    },
  },
  {
    name: "and moves the ungated number a lot",
    run: () => {
      const a = loudnessLufs(SPEECH, RATE).ungated;
      const b = loudnessLufs(SPEECH_AND_SILENCE, RATE).ungated;
      return expect(a - b > 2, `${a} vs ${b}`);
    },
  },
  {
    name: "the gate keeps the blocks with signal",
    run: () => {
      const result = loudnessLufs(SPEECH_AND_SILENCE, RATE);
      return expect(result.gatedBlocks < result.blocks, "nothing gated");
    },
  },
  {
    name: "the gate keeps every block of a continuous tone",
    run: () => {
      const result = loudnessLufs(SPEECH, RATE);
      return eq(result.gatedBlocks, result.blocks, "blocks");
    },
  },
  {
    name: "a longer silence does not lower the gated number further",
    run: () => {
      const short = loudnessLufs(concat(SPEECH, new Float32Array(RATE)), RATE).integrated;
      const long = loudnessLufs(concat(SPEECH, new Float32Array(RATE * 4)), RATE).integrated;
      return expect(Math.abs(short - long) < 0.2, `${short} vs ${long}`);
    },
  },
  {
    name: "a quieter tone reads lower",
    run: () => {
      const loud = loudnessLufs(tone(0.5, 2), RATE).integrated;
      const quiet = loudnessLufs(tone(0.25, 2), RATE).integrated;
      return near(loud - quiet, 6.02, 0.3, "difference");
    },
  },
  {
    name: "an all-silent file has no integrated loudness",
    run: () => eq(loudnessLufs(new Float32Array(RATE * 2), RATE).integrated, Number.NEGATIVE_INFINITY, "lufs"),
  },
  {
    name: "the block count grows with the duration",
    run: () =>
      expect(loudnessLufs(SPEECH, RATE).blocks < loudnessLufs(concat(SPEECH, SPEECH), RATE).blocks, "blocks"),
  },
  {
    name: "the gated number is never lower than the ungated one",
    run: () => {
      const result = loudnessLufs(SPEECH_AND_SILENCE, RATE);
      return expect(result.integrated >= result.ungated, "gated lower than ungated");
    },
  },
];

export function main(): number {
  for (const [label, samples] of [
    ["tone", SPEECH],
    ["tone + 2 s silence", SPEECH_AND_SILENCE],
    ["tone + 4 s silence", concat(SPEECH, new Float32Array(RATE * 4))],
  ] as const) {
    const result = loudnessLufs(samples, RATE);
    console.log(
      `${label.padEnd(22)} ${result.integrated.toFixed(2)} LUFS  (${result.ungated.toFixed(2)} ungated, ${result.gatedBlocks}/${result.blocks} blocks)`,
    );
  }
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
