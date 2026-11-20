/**
 * Example 1 - the command for one reel, printed before anything runs.
 *
 *   node chapters/chapter04/files/01_command_for_one_reel.ts
 *
 * The argument vector is the whole interface between this book and FFmpeg. Reading it is how a
 * reader learns what `-crf` does without opening a manual, and building it in a function is how
 * the chapter tests the command without the wasm.
 */

import { assertSafeArgs, transcodeArgs } from "./commands.ts";

export function main(): number {
  const args = transcodeArgs({
    input: "input.mp4",
    output: "output.mp4",
    crf: 28,
    width: 1280,
    preset: "veryfast",
  });

  assertSafeArgs(args);

  console.log("ffmpeg " + args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" "));
  console.log("");
  console.log(`${args.length} arguments, and each one is a decision:`);
  console.log("  -i input.mp4          the file the job reads, already in MEMFS");
  console.log("  -c:v libx264          H.264, because every browser plays it");
  console.log("  -crf 28               the quality dial: lower is better and bigger");
  console.log("  -preset veryfast      how hard the encoder thinks, not how good it is");
  console.log("  -pix_fmt yuv420p      the only chroma layout a phone decodes in hardware");
  console.log("  -vf scale=1280:-2     1280 wide, and -2 keeps the height even");
  console.log("  -c:a aac -b:a 96k     the audio track, at a bitrate nobody notices");
  console.log("  -movflags +faststart  the index at the front, so the player can seek");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
