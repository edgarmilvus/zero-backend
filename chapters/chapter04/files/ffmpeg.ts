/**
 * The adapter: the only file that loads the 31 MB of WebAssembly.
 *
 * The import is dynamic so that node can load this module without a browser, and the type is
 * structural so the rest of the chapter never names the package. That is the same arrangement as
 * chapter 3's storage port, one level up: the thing that cannot run in CI lives at the edge.
 */

import type { Progress } from "./commands.ts";
import { parseProgress } from "./commands.ts";
import type { VirtualFiles } from "./vfs.ts";

/** The two files the core is made of, wherever they are served from. */
export type CoreSource = {
  readonly js: string;
  readonly wasm: string;
};

/** The five members this chapter uses, and nothing else from the package. */
export type FfmpegLike = {
  readonly loaded: boolean;
  exec(args: string[]): Promise<number>;
  writeFile(name: string, data: Uint8Array): Promise<boolean>;
  readFile(name: string): Promise<Uint8Array>;
  deleteFile(name: string): Promise<boolean>;
  on(event: "log", listener: (event: { message: string }) => void): void;
  terminate(): void;
};

/**
 * Loads the core from two URLs.
 *
 * `toBlobURL` is not decoration: the wasm has to be fetched as a blob so the Worker can be
 * started from a same-origin URL. A page served without the two isolation headers still loads
 * the single-threaded core, and chapter 2's profile is how a caller knows which one it got.
 */
export async function loadFfmpeg(source: CoreSource): Promise<FfmpegLike> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");

  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(source.js, "text/javascript"),
    wasmURL: await toBlobURL(source.wasm, "application/wasm"),
  });

  return ffmpeg as unknown as FfmpegLike;
}

/**
 * One transcode: input in, command run, output out, both files deleted.
 *
 * The write and the read are inside the clock on purpose. Chapter 3's exercise 3 is about a
 * measurement that starts too late, and a transcode whose stopwatch begins at `exec` reports a
 * number that excludes the two copies of the file.
 */
export async function transcodeToVfs(options: {
  readonly ffmpeg: FfmpegLike;
  readonly files: VirtualFiles;
  readonly input: string;
  readonly output: string;
  readonly args: readonly string[];
  readonly onProgress?: (progress: Progress) => void;
}): Promise<{ readonly outputBytes: number; readonly wallClockMs: number; readonly mediaMs: number }> {
  const { ffmpeg, files, input, output, args } = options;

  // A holder rather than a rebindable local: TypeScript's flow analysis does not see an
  // assignment made inside a callback, and would narrow the variable to null at the use.
  const seen: { last: Progress | null } = { last: null };
  ffmpeg.on("log", (event) => {
    const parsed = parseProgress(event.message);
    if (parsed) {
      seen.last = parsed;
      options.onProgress?.(parsed);
    }
  });

  const started = performance.now();
  await ffmpeg.writeFile(input, files.read(input));
  const code = await ffmpeg.exec([...args]);
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  const result = await ffmpeg.readFile(output);
  const wallClockMs = performance.now() - started;

  // The two files are the instance's memory: delete them or the next job has less room.
  await ffmpeg.deleteFile(input);
  await ffmpeg.deleteFile(output);

  return {
    outputBytes: result.byteLength,
    wallClockMs,
    mediaMs: seen.last?.timeMs ?? 0,
  };
}
