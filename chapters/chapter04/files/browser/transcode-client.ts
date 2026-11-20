/**
 * The page: load 31 MB, transcode a real file, print the numbers.
 *
 * It imports the same modules the harness tests — the command builder, the virtual file table,
 * the result renderer — and it adds the one thing that needs a browser: the instance. Nothing
 * here is copied into a bundle; the import map points at what npm installed.
 */

import { transcodeArgs, type Progress } from "../commands.ts";
import { VirtualFiles } from "../vfs.ts";
import { loadFfmpeg, transcodeToVfs, type FfmpegLike } from "../ffmpeg.ts";
import { renderResult, type TranscodeResult } from "../report.ts";

export type PageResult = TranscodeResult & {
  readonly coreLoadMs: number;
  readonly coreBytes: number;
};

let instance: FfmpegLike | null = null;
let coreLoadMs = 0;

/** The instance is created once and reused: the second job does not pay for the download. */
async function ffmpegOnce(): Promise<{ ffmpeg: FfmpegLike; coreLoadMs: number }> {
  if (instance) return { ffmpeg: instance, coreLoadMs };
  const started = performance.now();
  instance = await loadFfmpeg({
    js: "/core/ffmpeg-core.js",
    wasm: "/core/ffmpeg-core.wasm",
  });
  coreLoadMs = performance.now() - started;
  return { ffmpeg: instance, coreLoadMs };
}

/** One transcode, from the bytes to the four numbers the record keeps. */
export async function transcodeHere(
  bytes: Uint8Array,
  options: { readonly onProgress?: (progress: Progress) => void } = {},
): Promise<PageResult> {
  const { ffmpeg, coreLoadMs: loadMs } = await ffmpegOnce();

  // Read the size before the bytes are handed to the worker: `writeFile` transfers the
  // ArrayBuffer, and a transferred buffer is detached, so `bytes.byteLength` is zero afterwards.
  const inputBytes = bytes.byteLength;

  const files = new VirtualFiles(256 * 1e6);
  files.write("input.mp4", bytes);

  const args = transcodeArgs({
    input: "input.mp4",
    output: "output.mp4",
    crf: 30,
    width: 160,
    preset: "veryfast",
    audioBitrate: "48k",
  });

  const run = await transcodeToVfs({
    ffmpeg,
    files,
    input: "input.mp4",
    output: "output.mp4",
    args,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  });

  const wasm = await fetch("/core/ffmpeg-core.wasm");
  const coreBytes = Number(wasm.headers.get("content-length") ?? 0);

  return {
    codec: "h264",
    inputBytes,
    outputBytes: run.outputBytes,
    wallClockMs: run.wallClockMs,
    mediaMs: run.mediaMs,
    // 320x180 scaled to 160 wide: the height follows the aspect ratio and `-2` keeps it even.
    width: 160,
    height: 90,
    coreLoadMs: loadMs,
    coreBytes,
  };
}

/** The fixture the chapter ships, as bytes. */
export async function fixtureBytes(): Promise<Uint8Array> {
  const response = await fetch("/chapter04/files/fixtures/sample.mp4");
  if (!response.ok) throw new Error(`fixture: ${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
}

declare global {
  interface Window {
    __transcode: () => Promise<PageResult>;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const bar = document.querySelector<HTMLProgressElement>("#bar");
  const button = document.querySelector<HTMLButtonElement>("#run");

  const run = async (): Promise<void> => {
    if (!output) return;
    output.textContent = "fetching the fixture...";
    const bytes = await fixtureBytes();

    const result = await transcodeHere(bytes, {
      onProgress: (progress) => {
        if (bar) bar.value = Math.min(1, progress.timeMs / 2000);
        if (status) {
          status.textContent = `${(progress.timeMs / 1000).toFixed(2)} s of 2.00 s · ${
            progress.speed || 0
          }x · ${progress.frame} frames`;
        }
      },
    });

    if (bar) bar.value = 1;
    if (status) status.textContent = `done: ${(result.wallClockMs / 1000).toFixed(2)} s of wall clock`;
    output.textContent = `${renderResult(result)}\ncore load        ${(
      result.coreLoadMs / 1000
    ).toFixed(2)} s for ${(result.coreBytes / 1e6).toFixed(1)} MB of WebAssembly`;
  };

  window.__transcode = async () => transcodeHere(await fixtureBytes());
  button?.addEventListener("click", () => void run());
}
