/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * Reads a record, asks the core for its meters, and prints the numbers the ledger needs. It decides
 * nothing: the cut share comes from the schema and the RMS from the core.
 *
 *   node chapters/chapter07/files/exercises/ex5_audio.ts <audio.json> [wav]
 */

import { readFileSync } from "node:fs";

import { newSamples, peakOf, rms } from "./sample_core.ts";
import { normalize, readAudio } from "./audio_record.ts";
import { readWav } from "../wav.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  const wavPath = argv[1];
  if (!path) {
    console.error("usage: ex5_audio.ts <audio.json> [wav]");
    return 2;
  }

  let record;
  try {
    record = readAudio(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  console.log(`recording        ${record.name} at ${record.sampleRate} Hz`);
  console.log(`kept             ${numbers.keptSeconds.toFixed(2)} s`);
  console.log(`cut              ${record.cutSeconds.toFixed(2)} s, ${(numbers.cutShare * 100).toFixed(0)}% of the material`);
  console.log(`loudness         ${record.loudnessLufs.toFixed(2)} LUFS`);
  console.log(`headroom         ${numbers.headroom.toFixed(2)} dB`);

  if (wavPath) {
    const audio = readWav(new Uint8Array(readFileSync(wavPath)));
    const channel = audio.channels[0];
    if (channel) {
      const samples = newSamples(audio.sampleRate, channel);
      console.log("");
      console.log(`samples          ${channel.length}, peak ${peakOf(samples).toFixed(3)}, rms ${rms(samples).toFixed(3)}`);
    }
  }

  return numbers.cutShare > 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
