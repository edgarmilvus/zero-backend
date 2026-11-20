/**
 * Example 2 - the two clocks, and the bug that comes from mixing them.
 *
 *   node chapters/chapter05/files/02_two_clocks.ts
 *
 * The container counts in its own timescale, WebCodecs counts in microseconds, and a page that
 * passes milliseconds to `VideoDecoder.decode` gets a first frame at 0.24 seconds and a buffer
 * that never drains in the order it expects.
 */

import { frameTimes, unitsFromUs, usFromTimescale } from "./frames.ts";

export function main(): number {
  const VIDEO_TIMESCALE = 15360; // the fixture's video track
  const AUDIO_TIMESCALE = 44100; // the fixture's audio track

  console.log(`video timescale  ${VIDEO_TIMESCALE} units per second`);
  console.log(`audio timescale  ${AUDIO_TIMESCALE} units per second`);
  console.log("");

  console.log("the same 2 seconds, in three units:");
  const twoSeconds = 2 * 1e6;
  console.log(`  microseconds     ${twoSeconds}`);
  console.log(`  video units      ${unitsFromUs(twoSeconds, VIDEO_TIMESCALE)}`);
  console.log(`  audio units      ${unitsFromUs(twoSeconds, AUDIO_TIMESCALE)}`);
  console.log("");

  console.log("the first four frames at 30 fps, as WebCodecs wants them:");
  const times = frameTimes(4, 30);
  for (const [index, us] of times.entries()) {
    console.log(`  frame ${index}   ${String(us).padStart(8)} us   (${(us / 1000).toFixed(1)} ms)`);
  }
  console.log("");

  // The bug: a page that builds timestamp 240 and calls it microseconds. 240 us is the first frame
  // of a 4,166 fps video, which is what the decoder will silently believe.
  const milliseconds = 240;
  const misinterpreted = usFromTimescale(milliseconds, 1_000_000);
  console.log(`240 passed as us   ${misinterpreted} us = ${(misinterpreted / 1e6).toFixed(6)} s`);
  console.log(`240 as ms          ${milliseconds * 1000} us = 0.24 s, which is what the page meant`);
  console.log("");
  console.log("nothing throws: the decoder accepts the number and the frames arrive in the wrong order");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
