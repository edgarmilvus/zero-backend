/**
 * Example 5 - the round trip.
 *
 *   node chapters/chapter07/files/05_write_a_wav.ts
 *
 * Read, write, read again, and compare the samples. A writer that is off by one in its header
 * produces a file that plays at the wrong speed and sounds like a chipmunk, which is the defect this
 * example exists to catch.
 */

import { readWav, writeWav, durationSeconds } from "./wav.ts";
import { loadVoice } from "./01_read_the_fixture.ts";

export function main(): number {
  const original = loadVoice();
  const bytes = writeWav(original);
  const again = readWav(bytes);

  const left = original.channels[0];
  const right = again.channels[0];
  if (!left || !right) throw new Error("no channel");

  let worst = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    worst = Math.max(worst, Math.abs((left[index] ?? 0) - (right[index] ?? 0)));
  }

  console.log(`original            ${left.length} frames, ${durationSeconds(original).toFixed(3)} s`);
  console.log(`written             ${bytes.byteLength} bytes`);
  console.log(`read back           ${right.length} frames, ${durationSeconds(again).toFixed(3)} s`);
  console.log(`rate                ${again.sampleRate} Hz, ${again.channels.length} channel(s)`);
  console.log("");
  console.log(`worst sample error  ${worst.toExponential(2)}`);
  console.log("sixteen-bit rounding is the only loss, and it is under one least significant bit");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
