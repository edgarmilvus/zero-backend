/**
 * Example 1 - the fixture, read as samples.
 *
 *   node chapters/chapter07/files/01_read_the_fixture.ts
 *
 * Three seconds at 44.1 kHz: a second of silence, a second of a 440 Hz tone at half amplitude, a
 * second of silence. Every number in this chapter is computed from it, so the expected values are
 * known before any code runs.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readWav, durationSeconds } from "./wav.ts";
import { dbfs, findSilence, loudnessLufs, rmsDbfs } from "./audio.ts";
import { renderAudio } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE = join(HERE, "fixtures", "voice.wav");

export function loadVoice(): ReturnType<typeof readWav> {
  return readWav(new Uint8Array(readFileSync(FIXTURE)));
}

export function main(): number {
  const audio = loadVoice();
  const channel = audio.channels[0];
  if (!channel) throw new Error("the fixture has no channel");

  let peak = 0;
  for (const sample of channel) peak = Math.max(peak, Math.abs(sample));

  const tone = channel.subarray(
    Math.round(1.2 * audio.sampleRate),
    Math.round(1.8 * audio.sampleRate),
  );
  const loudness = loudnessLufs(channel, audio.sampleRate);
  const silence = findSilence(channel, audio.sampleRate, { thresholdDbfs: -50, minMs: 200 });

  console.log(
    renderAudio({
      name: "voice.wav",
      sampleRate: audio.sampleRate,
      channels: audio.channels.length,
      seconds: durationSeconds(audio),
      peakDbfs: dbfs(peak),
      rmsDbfs: rmsDbfs(tone),
      loudness: loudness.integrated,
      ungated: loudness.ungated,
      silenceRuns: silence.length,
    }),
  );
  console.log("");
  console.log(
    `silence at         ${silence.map((run) => `${(run.startSample / audio.sampleRate).toFixed(2)}s`).join(", ")}`,
  );
  console.log("");
  console.log("half amplitude is -6 dBFS; a sine reads nine decibels under its peak");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
