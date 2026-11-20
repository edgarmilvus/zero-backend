/**
 * Example 2 - the log line is the only clock inside the job.
 *
 *   node chapters/chapter04/files/02_parse_progress.ts
 *
 * FFmpeg writes its position into its own output, and that line is the only progress signal the
 * wasm build gives. It is also the number a progress bar must not confuse with the wall clock:
 * `time=` is media time, and a job at 4x real time reaches 100 per cent in a quarter of its
 * duration.
 */

import { parseProgress, type Progress } from "./commands.ts";

/** What a real two-second encode looks like, line by line, from the chapter's fixture. */
export const TRANSCRIPT: readonly string[] = [
  "ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers",
  "Stream mapping:",
  "  Stream #0:0 -> #0:0 (h264 (native) -> h264 (libx264))",
  "frame=    8 fps=0.0 q=28.0 size=       0kB time=00:00:00.53 bitrate=   0.7kbits/s speed=1.51x",
  "frame=   18 fps= 15 q=28.0 size=      12kB time=00:00:01.20 bitrate=  82.4kbits/s speed=1.19x",
  "frame=   30 fps= 14 q=-1.0 Lsize=      25kB time=00:00:02.00 bitrate= 101.9kbits/s speed=1.12x",
  "video:21kB audio:3kB subtitle:0kB other streams:0kB global headers:0kB muxing overhead: 1.2%",
];

export function main(): number {
  const parsed: Progress[] = [];
  for (const line of TRANSCRIPT) {
    const progress = parseProgress(line);
    if (progress) parsed.push(progress);
  }

  console.log(`${TRANSCRIPT.length} lines in, ${parsed.length} of them progress`);
  console.log("");
  for (const progress of parsed) {
    console.log(
      `  frame ${String(progress.frame).padStart(3)}  ` +
        `${(progress.timeMs / 1000).toFixed(2)} s of media  ` +
        `${progress.speed.toFixed(2)}x`,
    );
  }

  const last = parsed.at(-1);
  console.log("");
  if (!last) throw new Error("no progress line in the transcript");
  console.log(`media time       ${(last.timeMs / 1000).toFixed(2)} s (not the wall clock)`);
  console.log(`speed            ${last.speed.toFixed(2)}x real time, as FFmpeg reports it`);
  console.log("");
  console.log("the banner, the stream map and the summary all look like logs, and none is a position");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
