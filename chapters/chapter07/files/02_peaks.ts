/**
 * Example 2 - the waveform, at three resolutions.
 *
 *   node chapters/chapter07/files/02_peaks.ts
 *
 * A peak file is a reduction and every reduction throws something away. Min and max keep the
 * transient that an average loses, which is why a clipped drum is visible here and invisible in a
 * meter built from means.
 */

import { peaks } from "./audio.ts";
import { renderWaveform } from "./report.ts";
import { loadVoice } from "./01_read_the_fixture.ts";

export function main(): number {
  const audio = loadVoice();
  const channel = audio.channels[0];
  if (!channel) throw new Error("no channel");

  for (const buckets of [8, 24, 72]) {
    const reduced = peaks(channel, buckets);
    console.log(`${buckets} buckets, ${(channel.length / buckets).toFixed(0)} samples each`);
    console.log(renderWaveform(reduced));
    console.log("");
  }

  const oneBucket = peaks(channel, 1);
  console.log(`one bucket          min ${oneBucket[0]?.min.toFixed(3)} max ${oneBucket[0]?.max.toFixed(3)}`);
  console.log("a single bucket is the peak of the whole file, and it says nothing about where it was");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
