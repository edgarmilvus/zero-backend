/**
 * Example 3 - the gate, and what a silent minute does without it.
 *
 *   node chapters/chapter07/files/03_loudness.ts
 *
 * The fixture is a second of tone with a second of silence at each end. Gated and ungated loudness
 * differ by three units, and the difference is the whole reason the standard has a relative gate.
 */

import { loudnessLufs } from "./audio.ts";
import { assertLoudnessRange } from "./report.ts";
import { loadVoice } from "./01_read_the_fixture.ts";

export function main(): number {
  const audio = loadVoice();
  const channel = audio.channels[0];
  if (!channel) throw new Error("no channel");
  const rate = audio.sampleRate;

  const tone = channel.subarray(Math.round(1.2 * rate), Math.round(1.8 * rate));
  const withSilence = channel;
  const doubled = new Float32Array(channel.length * 2);
  doubled.set(channel, 0);
  doubled.set(channel, channel.length);

  const rows: [string, Float32Array][] = [
    ["tone only", tone],
    ["tone + 2 s silence", withSilence],
    ["tone + 2 s silence, twice", doubled],
  ];

  console.log(`${"material".padEnd(26)}${"gated".padStart(9)}${"ungated".padStart(9)}  gated blocks`);
  for (const [label, samples] of rows) {
    const result = loudnessLufs(samples, rate);
    assertLoudnessRange(result.integrated);
    console.log(
      `${label.padEnd(26)}${result.integrated.toFixed(2).padStart(9)}` +
        `${result.ungated.toFixed(2).padStart(9)}  ${result.gatedBlocks} of ${result.blocks}`,
    );
  }

  console.log("");
  console.log("the silence lowers the ungated number by three units and the gated one not at all");
  console.log("the third row has four times the silence and the same gated loudness, which is the point");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
