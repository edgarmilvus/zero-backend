/**
 * Chapter 4 harness: 56 assertions on the command, the virtual filesystem and the result.
 *
 * None of them loads the 31 MB core. The transcode itself is recorded once, in Chrome, and the
 * gate tests the layer that decides what to run and what to do with the answer.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertSafeArgs,
  concatArgs,
  parseProgress,
  thumbnailArgs,
  transcodeArgs,
  type Progress,
} from "./commands.ts";
import {
  VirtualFiles,
  assertManifestName,
  escapeConcatPath,
  manifestText,
} from "./vfs.ts";
import {
  assertOutputSmaller,
  assertSpeedup,
  compressionRatio,
  formatBytes,
  renderResult,
  speedup,
  type TranscodeResult,
} from "./report.ts";
import { estimateOutputBytes, decide, type Estimate } from "./05_estimate_before_running.ts";
import { QuotaExceeded } from "../../chapter03/files/storage.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };

const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => {
  checks.push({ name, run });
};

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}

function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) {
    throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  }
  return true;
}

function throwsSync(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

const RESULT: TranscodeResult = {
  codec: "h264",
  inputBytes: 200_000,
  outputBytes: 50_000,
  wallClockMs: 2000,
  mediaMs: 4000,
  width: 1280,
  height: 720,
};

// --- the command ------------------------------------------------------------

check("the transcode command reads, encodes and writes", () => {
  const args = transcodeArgs({ input: "in.mp4", output: "out.mp4" });
  eq(args[0], "-i", "first");
  eq(args[1], "in.mp4", "input");
  return eq(args.at(-1), "out.mp4", "output");
});
check("the default codec is H.264 with yuv420p", () => {
  const args = transcodeArgs({ input: "a", output: "b" }).join(" ");
  expect(args.includes("libx264"), "libx264");
  return expect(args.includes("yuv420p"), "yuv420p");
});
check("the crf is a string and defaults to 23", () => {
  const args = transcodeArgs({ input: "a", output: "b" });
  const at = args.indexOf("-crf");
  eq(typeof args[at + 1], "string", "type");
  return eq(args[at + 1], "23", "default");
});
check("a width adds a scale filter with an even height", () => {
  const args = transcodeArgs({ input: "a", output: "b", width: 1280 }).join(" ");
  return expect(args.includes("scale=1280:-2"), args);
});
check("no width adds no filter at all", () => {
  const args = transcodeArgs({ input: "a", output: "b" }).join(" ");
  return expect(!args.includes("-vf"), "unexpected filter");
});
check("faststart is in every transcode", () => {
  const args = transcodeArgs({ input: "a", output: "b" }).join(" ");
  return expect(args.includes("+faststart"), args);
});
check("a thumbnail seeks before the input and takes one frame", () => {
  const args = thumbnailArgs({ input: "a.mp4", output: "t.jpg", atMs: 1500 });
  eq(args[0], "-ss", "seek first");
  eq(args[1], "1.500", "seconds");
  return eq(args[args.indexOf("-frames:v") + 1], "1", "frames");
});
check("the thumbnail scale defaults to 320 wide", () => {
  const args = thumbnailArgs({ input: "a", output: "b", atMs: 0 }).join(" ");
  return expect(args.includes("scale=320:-2"), args);
});
check("concat copies without re-encoding", () => {
  const args = concatArgs({ manifest: "list.txt", output: "out.mp4" }).join(" ");
  expect(args.includes("-f concat"), args);
  expect(args.includes("-safe 0"), args);
  return expect(args.includes("-c copy"), args);
});

// --- the refusals -----------------------------------------------------------

check("an argument vector with no input is refused", () => {
  const error = throwsSync(() => assertSafeArgs(["out.mp4"]), "no input");
  return expect(error.message.includes("-i"), error.message);
});
check("the same path for input and output is refused", () => {
  const error = throwsSync(() => assertSafeArgs(["-i", "a.mp4", "a.mp4"]), "same path");
  return expect(error.message.includes("destroys"), error.message);
});
check("an absolute path is refused", () => {
  const error = throwsSync(() => assertSafeArgs(["-i", "/a.mp4", "b.mp4"]), "absolute");
  return expect(error.message.includes("absolute"), error.message);
});
check("a path that walks out of the mount is refused", () => {
  const error = throwsSync(() => assertSafeArgs(["-i", "../../etc/passwd", "b.mp4"]), "dot dot");
  return expect(error.message.includes(".."), error.message);
});
check("a concat command passes the same refusals", () =>
  expect(
    assertSafeArgs(concatArgs({ manifest: "list.txt", output: "merged.mp4" })) === undefined,
    "threw on a concat",
  ),
);
check("faststart is written before the output, not after it", () => {
  const args = transcodeArgs({ input: "a", output: "b" });
  const at = args.indexOf("-movflags");
  return expect(at > 0 && at < args.length - 2, "movflags position");
});
check("a valid command passes", () =>
  expect(assertSafeArgs(transcodeArgs({ input: "in.mp4", output: "out.mp4" })) === undefined, "threw"),
);
check("an output that looks like a flag is refused", () => {
  const error = throwsSync(() => assertSafeArgs(["-i", "in.mp4", "-crf"]), "flag output");
  return expect(error.message.includes("output"), error.message);
});

// --- progress ---------------------------------------------------------------

const LINES = {
  banner: "ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers",
  map: "  Stream #0:0 -> #0:0 (h264 (native) -> h264 (libx264))",
  first: "frame=    8 fps=0.0 q=28.0 size=       0kB time=00:00:00.53 bitrate=   0.7kbits/s speed=1.51x",
  last: "frame=   30 fps= 14 q=-1.0 Lsize=      25kB time=00:00:02.00 bitrate= 101.9kbits/s speed=1.12x",
  summary: "video:21kB audio:3kB subtitle:0kB other streams:0kB global headers:0kB muxing overhead: 1.2%",
};

check("the banner is not progress", () => eq(parseProgress(LINES.banner), null, "banner"));
check("the stream map is not progress", () => eq(parseProgress(LINES.map), null, "map"));
check("the summary line is not progress", () => eq(parseProgress(LINES.summary), null, "summary"));
check("a progress line gives media time in milliseconds", () =>
  eq(parseProgress(LINES.last)?.timeMs, 2000, "timeMs"),
);
check("the frame count is read from the same line", () =>
  eq(parseProgress(LINES.last)?.frame, 30, "frame"),
);
check("speed is read as a factor", () => eq(parseProgress(LINES.last)?.speed, 1.12, "speed"));
check("a line with a frame count but no time is not progress", () =>
  eq(parseProgress("frame=  120 fps= 30 q=28.0 size=  64kB"), null, "frame only"),
);
check("a fractional time is converted, not truncated", () =>
  eq(parseProgress(LINES.first)?.timeMs, 530, "timeMs"),
);
check("an hour-long line still parses", () => {
  const progress: Progress | null = parseProgress("frame=1 time=01:02:03.50 speed=2.0x");
  return eq(progress?.timeMs, 3_723_500, "timeMs");
});

// --- the virtual filesystem -------------------------------------------------

check("a file written to MEMFS can be read back", () => {
  const files = new VirtualFiles();
  files.write("a.bin", new Uint8Array([1, 2, 3]));
  return eq(files.read("a.bin").byteLength, 3, "bytes");
});
check("the listing is sorted by name", () => {
  const files = new VirtualFiles();
  files.write("c", new Uint8Array(1));
  files.write("a", new Uint8Array(1));
  return eq(files.list().map((entry) => entry.name).join(","), "a,c", "order");
});
check("reading a file that is not there throws by name", () => {
  const error = throwsSync(() => new VirtualFiles().read("ghost.mp4"), "missing");
  return expect(error.message.includes("ghost.mp4"), error.message);
});
check("removing a file frees its bytes", () => {
  const files = new VirtualFiles();
  files.write("a.bin", new Uint8Array(100));
  files.remove("a.bin");
  return eq(files.usedBytes(), 0, "used");
});
check("a write past the budget is refused with two numbers", () => {
  const files = new VirtualFiles(1000);
  const error = throwsSync(() => files.write("a.bin", new Uint8Array(1200)), "budget");
  expect(error instanceof QuotaExceeded, error.name);
  return eq((error as QuotaExceeded).neededBytes, 1200, "needed");
});
check("overwriting a file does not double count its bytes", () => {
  const files = new VirtualFiles(1000);
  files.write("a.bin", new Uint8Array(600));
  files.write("a.bin", new Uint8Array(600));
  return eq(files.usedBytes(), 600, "used");
});
check("a name with a space is refused", () => {
  const error = throwsSync(() => assertManifestName("chunk 0.mp4"), "space");
  return expect(error.message.includes("whitespace"), error.message);
});
check("a name with a slash is refused", () => {
  const error = throwsSync(() => assertManifestName("dir/a.mp4"), "slash");
  return expect(error.message.includes("segment"), error.message);
});
check("a name that starts with a dash is refused", () => {
  const error = throwsSync(() => assertManifestName("-i"), "dash");
  return expect(error.message.includes("dash"), error.message);
});
check("a plain name passes", () =>
  expect(assertManifestName("chunk-0.mp4") === undefined, "threw"),
);
check("the manifest is one quoted line per segment", () => {
  const text = manifestText(["a.mp4", "b.mp4"]);
  return eq(text, "file 'a.mp4'\nfile 'b.mp4'\n", "manifest");
});
check("an empty manifest is refused", () => {
  const error = throwsSync(() => manifestText([]), "empty");
  return expect(error.message.includes("nothing to join"), error.message);
});
check("a quote in a path is escaped the way the demuxer wants", () =>
  eq(escapeConcatPath("it's.mp4"), `'it'\\''s.mp4'`, "escape"),
);

// --- the result -------------------------------------------------------------

check("the compression ratio is input over output", () =>
  eq(compressionRatio(RESULT), 4, "ratio"),
);
check("speed is media time over wall clock", () => eq(speedup(RESULT), 2, "speed"));
check("an output larger than the input fails the assertion", () => {
  const error = throwsSync(
    () => assertOutputSmaller({ ...RESULT, outputBytes: 300_000 }),
    "bigger output",
  );
  return expect(error.message.includes("not smaller"), error.message);
});
check("a plausible speed passes", () =>
  expect(assertSpeedup(RESULT) === undefined, "threw"),
);
check("gigabytes are formatted with two decimals", () => {
  eq(formatBytes(4e9), "4.00 GB", "gigabytes");
  return eq(renderResult({ ...RESULT, inputBytes: 4e9, outputBytes: 1e9 }).includes("4.0x smaller"), true, "ratio line");
});
check("a speed of zero fails", () => {
  const error = throwsSync(() => assertSpeedup({ ...RESULT, wallClockMs: 0 }), "zero clock");
  return expect(error.message.includes("zero"), error.message);
});
check("the rendered result carries both clocks", () => {
  const text = renderResult(RESULT);
  expect(text.includes("4.00 s"), "media time");
  return expect(text.includes("2.00 s"), "wall clock");
});
check("bytes are formatted in decimal units", () => {
  eq(formatBytes(999), "999 B", "bytes");
  eq(formatBytes(1500), "1.5 kB", "kilobytes");
  return eq(formatBytes(2_500_000), "2.5 MB", "megabytes");
});

// --- the estimate -----------------------------------------------------------

check("the estimate multiplies bitrate by duration", () => {
  const estimate: Estimate = {
    durationSeconds: 10,
    videoBitrateKbps: 1000,
    audioBitrateKbps: 0,
    inputBytes: 1e6,
    budgetBytes: 1e8,
  };
  return eq(estimateOutputBytes(estimate), 1_300_000, "bytes");
});
check("a two-second clip fits a 256 MB budget", () => {
  const estimate: Estimate = {
    durationSeconds: 2,
    videoBitrateKbps: 1000,
    audioBitrateKbps: 96,
    inputBytes: 34_267,
    budgetBytes: 256e6,
  };
  return eq(decide(estimate), "fits", "verdict");
});
check("a two-minute reel is tight, not impossible", () => {
  const estimate: Estimate = {
    durationSeconds: 120,
    videoBitrateKbps: 2500,
    audioBitrateKbps: 128,
    inputBytes: 120e6,
    budgetBytes: 256e6,
  };
  return eq(decide(estimate), "tight", "verdict");
});
check("a half-hour export is refused before the download", () => {
  const estimate: Estimate = {
    durationSeconds: 1800,
    videoBitrateKbps: 2500,
    audioBitrateKbps: 128,
    inputBytes: 540e6,
    budgetBytes: 256e6,
  };
  return eq(decide(estimate), "refuse", "verdict");
});

// --- the programs -----------------------------------------------------------

const run = (script: string) =>
  spawnSync(process.execPath, [join(ROOT, script)], { encoding: "utf8" });

check("01 prints an argument vector and its reasons", () => {
  const result = run("01_command_for_one_reel.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("-crf 28"), "crf line");
});
check("02 finds the progress lines and ignores the rest", () => {
  const result = run("02_parse_progress.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("3 of them progress"), result.stdout);
});
check("03 builds a manifest and refuses a name with a space", () => {
  const result = run("03_build_manifest.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("file 'chunk-1.mp4'"), "manifest");
  return expect(result.stdout.includes("whitespace"), "refusal");
});
check("04 refuses the second file and never starts the encoder", () => {
  const result = run("04_vfs_budget.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("REFUSED"), "refusal");
  return expect(result.stdout.includes("320.0 MB"), "numbers");
});
check("05 refuses the half-hour export", () => {
  const result = run("05_estimate_before_running.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("refuse"), "verdict");
});

// --- run --------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
    return 1;
  }

  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${number}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${number}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }

  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
