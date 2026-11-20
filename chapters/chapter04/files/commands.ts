/**
 * The command, as a value.
 *
 * FFmpeg takes an argument vector, and an argument vector is a list of strings. Building it in
 * one place means the chapter can test the command without the 31 MB of WebAssembly that runs
 * it, and a reader can read the command without opening devtools.
 */

export type TranscodeOptions = {
  readonly input: string;
  readonly output: string;
  /** Constant rate factor, 0-51. Lower is better and bigger. 23 is FFmpeg's default. */
  readonly crf?: number;
  /** Longest side in pixels, keeping the aspect ratio. */
  readonly width?: number;
  readonly preset?: "ultrafast" | "veryfast" | "medium" | "veryslow";
  readonly audioBitrate?: string;
};

/** H.264 and AAC in an MP4, which is what a phone reel needs and what a browser plays. */
export function transcodeArgs(options: TranscodeOptions): string[] {
  const args = [
    "-i",
    options.input,
    "-c:v",
    "libx264",
    "-crf",
    String(options.crf ?? 23),
    "-preset",
    options.preset ?? "veryfast",
    "-pix_fmt",
    "yuv420p",
  ];

  if (options.width !== undefined) {
    args.push("-vf", `scale=${options.width}:-2`);
  }

  args.push("-c:a", "aac", "-b:a", options.audioBitrate ?? "96k", "-movflags", "+faststart");
  args.push(options.output);
  return args;
}

/** One frame, at a time in milliseconds, scaled to a width. */
export function thumbnailArgs(options: {
  readonly input: string;
  readonly output: string;
  readonly atMs: number;
  readonly width?: number;
}): string[] {
  const seconds = (options.atMs / 1000).toFixed(3);
  return [
    "-ss",
    seconds,
    "-i",
    options.input,
    "-frames:v",
    "1",
    "-vf",
    `scale=${options.width ?? 320}:-2`,
    "-q:v",
    "4",
    options.output,
  ];
}

/**
 * The concat demuxer's command, with `-c copy` so the segments are joined without re-encoding.
 *
 * Stream copy only works when every segment has the same codec, resolution and time base. That
 * is not a limitation of the browser; it is the demuxer's contract, and the chapter says so.
 */
export function concatArgs(options: { readonly manifest: string; readonly output: string }): string[] {
  return ["-f", "concat", "-safe", "0", "-i", options.manifest, "-c", "copy", options.output];
}

/**
 * The three refusals that turn an argument vector into a command a machine can survive.
 *
 * Every one of them is a defect somebody shipped: the same path in and out, a relative path that
 * escapes the virtual file system, and an output the demuxer cannot write because it has no
 * container it recognises.
 */
export function assertSafeArgs(args: readonly string[]): void {
  const inputAt = args.indexOf("-i");
  if (inputAt < 0 || inputAt + 1 >= args.length) {
    throw new Error("command: no -i and its file, so there is nothing to read");
  }

  const input = args[inputAt + 1];
  const output = args[args.length - 1];

  if (output === undefined || output.startsWith("-")) {
    throw new Error(`command: the last argument must be the output file, got "${String(output)}"`);
  }
  if (output === input) {
    throw new Error(`command: "${output}" is both the input and the output, so the job destroys it`);
  }
  for (const path of [input, output]) {
    if (path !== undefined && path.startsWith("/")) {
      throw new Error(`command: "${path}" is absolute; MEMFS paths are relative to the mount`);
    }
    if (path !== undefined && path.includes("..")) {
      throw new Error(`command: "${path}" walks out of the mount with ..`);
    }
  }
}

export type Progress = {
  readonly frame: number;
  readonly fps: number;
  /** Media time, not wall clock: how far into the file the encoder has got. */
  readonly timeMs: number;
  readonly speed: number;
};

/**
 * One line of FFmpeg's own progress output, parsed.
 *
 * The line looks like:
 *   frame=   30 fps=  0 q=28.0 size=      12kB time=00:00:02.00 bitrate=  49.2kbits/s speed=1.2x
 *
 * A line that does not carry a `time=` is not progress: the banner, the stream mapping and the
 * final summary all look like logs and none of them is a position.
 */
export function parseProgress(line: string): Progress | null {
  const time = /time=(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(line);
  if (!time) return null;

  const [, hours, minutes, seconds, fraction = "0"] = time;
  const timeMs =
    (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 +
    Math.round(Number(`0.${fraction}`) * 1000);

  const frame = /frame=\s*(\d+)/.exec(line);
  const fps = /fps=\s*([\d.]+)/.exec(line);
  const speed = /speed=\s*([\d.]+)x/.exec(line);

  return {
    frame: frame ? Number(frame[1]) : 0,
    fps: fps ? Number(fps[1]) : 0,
    timeMs,
    speed: speed ? Number(speed[1]) : 0,
  };
}
