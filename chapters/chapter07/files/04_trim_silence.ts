/**
 * Example 4 - the trim, and the file that comes back.
 *
 *   node chapters/chapter07/files/04_trim_silence.ts
 *
 * A threshold in dBFS and a duration in milliseconds, never a single sample: a digital zero between
 * two words is one sample long and cutting it changes the sentence.
 */

import { findSilence, trimPlan } from "./audio.ts";
import { writeWav, type Audio } from "./wav.ts";
import { loadVoice } from "./01_read_the_fixture.ts";

const OPTIONS = { thresholdDbfs: -50, minMs: 200, marginMs: 100 };

export function main(): number {
  const audio = loadVoice();
  const channel = audio.channels[0];
  if (!channel) throw new Error("no channel");

  const runs = findSilence(channel, audio.sampleRate, OPTIONS);
  console.log(`silence runs        ${runs.length}`);
  for (const run of runs) {
    console.log(
      `  ${(run.startSample / audio.sampleRate).toFixed(2)}s .. ${(run.endSample / audio.sampleRate).toFixed(2)}s, ${run.seconds.toFixed(2)} s`,
    );
  }

  const plan = trimPlan(channel, audio.sampleRate, OPTIONS);
  console.log("");
  console.log(`plan                keep ${(plan.fromSample / audio.sampleRate).toFixed(2)}s .. ${(plan.toSample / audio.sampleRate).toFixed(2)}s`);
  console.log(`kept                ${plan.keptSeconds.toFixed(2)} s`);
  console.log(`cut                 ${plan.cutSeconds.toFixed(2)} s`);

  const trimmed: Audio = {
    channels: [channel.slice(plan.fromSample, plan.toSample)],
    sampleRate: audio.sampleRate,
  };
  const bytes = writeWav(trimmed);
  console.log("");
  console.log(`written             ${bytes.byteLength} bytes (from ${channel.length * 2 + 44})`);
  console.log("the trimmed file is a real WAV: the same header, fewer frames");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
