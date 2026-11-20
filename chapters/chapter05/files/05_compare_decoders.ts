/**
 * Example 5 - two records, one table.
 *
 *   node chapters/chapter05/files/05_compare_decoders.ts [left.json] [right.json]
 *
 * The comparison is only honest when both sides measured the same media, so the program reads two
 * records and refuses when the frame counts or the media durations disagree. With no arguments it
 * prints where the records are expected and stops, rather than inventing a table.
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { renderComparison, type DecoderRun } from "./report.ts";

export const DEFAULT_LEFT = "runs/chapter04/transcode-fixture/record.json";
export const DEFAULT_RIGHT = "runs/chapter05/canvas-clip/record.json";

function runFromRecord(path: string): DecoderRun {
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    runs?: Array<{ wallClockMs?: number; outputBytes?: number; mediaMs?: number; coreLoadMs?: number; coreBytes?: number }>;
    frames?: number;
    engine?: string;
  };

  const last = raw.runs?.at(-1);
  if (!last || typeof last.wallClockMs !== "number" || typeof last.outputBytes !== "number") {
    throw new Error(`${path}: no run with a wall clock and an output size`);
  }

  return {
    name: raw.engine === "chrome" && raw.frames !== undefined ? "webcodecs" : "ffmpeg-wasm",
    frames: raw.frames ?? 30,
    mediaMs: last.mediaMs ?? 0,
    wallClockMs: last.wallClockMs,
    outputBytes: last.outputBytes,
    startupMs: last.coreLoadMs ?? 0,
    startupBytes: last.coreBytes ?? 0,
  };
}

/**
 * Two runs are comparable when they cover the same amount of media.
 *
 * Not the same frame count: chapter 4's job is a container of 30 frames and this one is a canvas
 * of 60, and pretending they are the same job is the kind of comparison this book refuses. What
 * the table is for is the startup column and the shape of the cost, and the note says so.
 */
export function assertComparable(left: DecoderRun, right: DecoderRun): void {
  if (Math.abs(left.mediaMs - right.mediaMs) > 250) {
    throw new Error(
      `not comparable: ${left.mediaMs} ms of media against ${right.mediaMs} ms`,
    );
  }
}

export function main(argv: readonly string[]): number {
  const [leftPath = DEFAULT_LEFT, rightPath = DEFAULT_RIGHT] = argv;

  // Resolve against the working directory, and leave an absolute path alone: `join` would
  // concatenate them, and a record at /tmp/x.json would become $PWD/tmp/x.json.
  const resolve = (path: string): string => (isAbsolute(path) ? path : join(process.cwd(), path));
  const missing = [leftPath, rightPath].filter((path) => !existsSync(resolve(path)));
  if (missing.length > 0) {
    console.error(`no record at ${missing.join(" or ")}`);
    console.error("  run the two recorders first: chapter 4's transcode, then chapter 5's canvas clip");
    return 1;
  }

  const left = runFromRecord(resolve(leftPath));
  const right = runFromRecord(resolve(rightPath));
  assertComparable(left, right);

  console.log(renderComparison(left, right));
  console.log("");
  console.log(`startup is the difference: ${(left.startupBytes / 1e6).toFixed(1)} MB against ${(right.startupBytes / 1e6).toFixed(1)} MB`);
  if (left.frames !== right.frames) {
    console.log(
      `and the jobs differ: ${left.frames} frames against ${right.frames}. The table compares ` +
        `the startup and the shape of the cost, not the throughput.`,
    );
  }

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
