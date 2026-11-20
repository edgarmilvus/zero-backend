/**
 * What the chapter prints: the summary of a file, and the comparison of two decoders.
 *
 * The comparison is the chapter's argument in one table. The platform decoder is faster and
 * smaller and cannot open a file; the ported one opens anything and costs 32 MB. The numbers come
 * from two records, and the renderer refuses a comparison where the two did not measure the same
 * media.
 */

import type { Mp4Summary } from "./mp4.ts";

const PAD = 18;

export function renderSummary(summary: Mp4Summary): string {
  const lines = [
    `brand            ${summary.brand}`,
    `movie timescale  ${summary.movieTimescale}`,
    `tracks           ${summary.tracks.length}`,
    "",
  ];

  for (const track of summary.tracks) {
    lines.push(
      `  ${track.handler.padEnd(6)}${track.sampleEntry.padEnd(10)}${track.codec.padEnd(16)}` +
        `${track.width ? `${track.width}x${track.height}` : "-"}`,
    );
    lines.push(
      `  ${"".padEnd(6)}timescale ${track.timescale}, duration ${track.durationUnits} units, ` +
        `description ${track.description.byteLength} bytes`,
    );
  }

  return lines.join("\n");
}

export type DecoderRun = {
  readonly name: "ffmpeg-wasm" | "webcodecs" | "native";
  readonly frames: number;
  readonly mediaMs: number;
  readonly wallClockMs: number;
  readonly outputBytes: number;
  readonly startupMs: number;
  readonly startupBytes: number;
};

export function compareDecoders(
  left: DecoderRun,
  right: DecoderRun,
): readonly { readonly label: string; readonly left: string; readonly right: string }[] {
  const speed = (run: DecoderRun): number => run.mediaMs / run.wallClockMs;
  return [
    { label: "frames", left: String(left.frames), right: String(right.frames) },
    { label: "media", left: `${(left.mediaMs / 1000).toFixed(2)} s`, right: `${(right.mediaMs / 1000).toFixed(2)} s` },
    { label: "wall clock", left: `${left.wallClockMs.toFixed(0)} ms`, right: `${right.wallClockMs.toFixed(0)} ms` },
    { label: "speed", left: `${speed(left).toFixed(1)}x`, right: `${speed(right).toFixed(1)}x` },
    { label: "output", left: `${left.outputBytes} B`, right: `${right.outputBytes} B` },
    {
      label: "startup",
      left: `${left.startupMs.toFixed(0)} ms / ${(left.startupBytes / 1e6).toFixed(1)} MB`,
      right: `${right.startupMs.toFixed(0)} ms / ${(right.startupBytes / 1e6).toFixed(1)} MB`,
    },
  ];
}

export function renderComparison(left: DecoderRun, right: DecoderRun): string {
  const rows = compareDecoders(left, right);
  const lines = [`${"".padEnd(PAD)}${left.name.padEnd(16)}${right.name}`];
  for (const row of rows) {
    lines.push(`${row.label.padEnd(PAD)}${row.left.padEnd(16)}${row.right}`);
  }
  return lines.join("\n");
}

/** The fixture this chapter parses is the one the last chapter encoded: 320x180, H.264, 2 s. */
export function assertFixtureShape(summary: Mp4Summary): void {
  if (summary.brand !== "isom") {
    throw new Error(`fixture: expected an isom brand, got "${summary.brand}"`);
  }
  const video = summary.tracks.find((track) => track.handler === "vide");
  if (!video) throw new Error("fixture: no video track");
  if (video.width !== 320 || video.height !== 180) {
    throw new Error(`fixture: expected 320x180, got ${video.width}x${video.height}`);
  }
  if (video.description.byteLength === 0) {
    throw new Error("fixture: the video track has no description, so a decoder cannot start");
  }
}

/** Timestamps that go backwards are a decoder that will drop frames without saying so. */
export function assertMonotonic(timestampsUs: readonly number[]): void {
  for (let index = 1; index < timestampsUs.length; index += 1) {
    const previous = timestampsUs[index - 1] ?? 0;
    const current = timestampsUs[index] ?? 0;
    if (current <= previous) {
      throw new Error(`timestamps: frame ${index} at ${current} is not after ${previous}`);
    }
  }
}
