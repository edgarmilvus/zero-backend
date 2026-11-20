/**
 * What a transcode produced, and the two claims it has to defend.
 *
 * The numbers are the ones the ledger reads: input bytes, output bytes, the wall clock, and the
 * media time the encoder reported. The ratios are derived, never typed.
 */

export type TranscodeResult = {
  readonly codec: "h264" | "vp9" | "av1";
  readonly inputBytes: number;
  readonly outputBytes: number;
  /** From the click to the last byte read back out of MEMFS. */
  readonly wallClockMs: number;
  /** From the last progress line: how much media was encoded. */
  readonly mediaMs: number;
  readonly width: number;
  readonly height: number;
};

/** Decimal megabytes, because the files a user sees are measured that way. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(1)} kB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

export function compressionRatio(result: TranscodeResult): number {
  if (result.outputBytes <= 0) throw new Error("result: the output is empty");
  return result.inputBytes / result.outputBytes;
}

/** How many seconds of media the encoder produced per second of wall clock. */
export function speedup(result: TranscodeResult): number {
  const mediaSeconds = result.mediaMs / 1000;
  const wallSeconds = result.wallClockMs / 1000;
  if (wallSeconds <= 0) throw new Error("result: the wall clock is zero, so nothing was measured");
  return mediaSeconds / wallSeconds;
}

export function renderResult(result: TranscodeResult): string {
  const pad = 22;
  const lines = [
    `codec            ${result.codec} ${result.width}x${result.height}`,
    `input            ${(result.inputBytes / 1e6).toFixed(2)} MB`,
    `output           ${(result.outputBytes / 1e6).toFixed(2)} MB`,
    `ratio            ${compressionRatio(result).toFixed(1)}x smaller`,
    `media time       ${(result.mediaMs / 1000).toFixed(2)} s`,
    `wall clock       ${(result.wallClockMs / 1000).toFixed(2)} s`,
    `speed            ${speedup(result).toFixed(2)}x real time`,
  ];
  return lines.map((line) => `${line.slice(0, pad)}${line.slice(pad)}`).join("\n");
}

/**
 * A transcode that produced a bigger file is not a failure, but it is not a transcode either.
 *
 * The assertion exists so a chapter cannot claim compression over a fixture where the encoder
 * had nothing to remove. The sample in this chapter is a synthetic pattern with a sine tone: it
 * compresses well, and the check proves the command did what it said.
 */
export function assertOutputSmaller(result: TranscodeResult): void {
  if (result.outputBytes >= result.inputBytes) {
    throw new Error(
      `output ${result.outputBytes} bytes is not smaller than input ${result.inputBytes}`,
    );
  }
}

/**
 * Real-time speed, asserted as a range so a record from a slower machine still passes.
 *
 * The lower bound is what a browser build must manage for a two-second clip on a laptop; the
 * upper bound catches the arithmetic error where media time is divided by milliseconds.
 */
export function assertSpeedup(result: TranscodeResult): void {
  const speed = speedup(result);
  if (!(speed > 0.05 && speed < 60)) {
    throw new Error(`speed ${speed.toFixed(2)}x real time is outside the plausible range`);
  }
}
