/**
 * Chapter 5 harness: 56 assertions on the box tree, the clocks and the comparison.
 *
 * The fixture is chapter 4's, read from disk, so the parser is tested against a real H.264 file
 * rather than against a hand-written buffer that agrees with the bug.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BoxReader, find, payload, readBoxes, walk } from "./boxes.ts";
import { codecString, descriptionBytes, readMp4 } from "./mp4.ts";
import { frameTimes, plannedChunks, seekCost, unitsFromUs, usFromTimescale } from "./frames.ts";
import {
  assertFixtureShape,
  assertMonotonic,
  compareDecoders,
  renderComparison,
  renderSummary,
  type DecoderRun,
} from "./report.ts";
import { NEEDS, verdictFor } from "./04_what_it_needs.ts";
import { assertComparable } from "./05_compare_decoders.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "..", "chapter04", "files", "fixtures", "sample.mp4");
const bytes = new Uint8Array(readFileSync(FIXTURE));
const boxes = readBoxes(bytes);
const summary = readMp4(bytes);

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

// --- the box tree -----------------------------------------------------------

check("the file starts with ftyp", () => eq(boxes[0]?.type, "ftyp", "first box"));
check("the tree has four top-level boxes", () =>
  eq(boxes.map((box) => box.type).join(","), "ftyp,moov,free,mdat", "top level"),
);
check("a box's size covers its whole extent", () => {
  const ftyp = boxes[0];
  if (!ftyp) throw new Error("no ftyp");
  const declared = new BoxReader(bytes).u32(ftyp.start);
  return eq(ftyp.bytes, declared, "size");
});
check("the walker descends into containers", () =>
  expect(walk(boxes).some((entry) => entry.path === "moov/trak"), "no moov/trak"),
);
check("the path to the codec description is the documented one", () =>
  expect(
    walk(boxes).some((entry) => entry.path === "moov/trak/mdia/minf/stbl/stsd/avc1/avcC"),
    "no avcC at the expected path",
  ),
);
check("find returns the moov box", () => eq(find(boxes, "moov")?.type, "moov", "moov"));
check("find returns null for a path that is not there", () =>
  eq(find(boxes, "moov/mvhd/nope"), null, "missing"),
);
check("a 64-bit size is read as a size", () => {
  // A single box with size 1 and a 64-bit length of 24: header 16, payload 8.
  const buffer = new Uint8Array(24);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, 1);
  buffer.set([0x66, 0x72, 0x65, 0x65], 4); // free
  view.setUint32(8, 0);
  view.setUint32(12, 24);
  const parsed = readBoxes(buffer);
  eq(parsed.length, 1, "boxes");
  return eq(parsed[0]?.bytes, 24, "bytes");
});
check("a box that claims to run past the buffer stops the walk", () => {
  const buffer = new Uint8Array(16);
  new DataView(buffer.buffer).setUint32(0, 9999);
  buffer.set([0x6d, 0x6f, 0x6f, 0x76], 4); // moov
  return eq(readBoxes(buffer).length, 0, "boxes");
});
check("a box smaller than its own header stops the walk", () => {
  const buffer = new Uint8Array(16);
  new DataView(buffer.buffer).setUint32(0, 4);
  buffer.set([0x66, 0x72, 0x65, 0x65], 4);
  return eq(readBoxes(buffer).length, 0, "boxes");
});
check("payload returns the bytes after the header", () => {
  const ftyp = boxes[0];
  if (!ftyp) throw new Error("no ftyp");
  const body = payload(bytes, ftyp);
  return eq(body.byteLength, ftyp.bytes - ftyp.headerBytes, "bytes");
});

// --- the summary ------------------------------------------------------------

check("the brand is isom", () => eq(summary.brand, "isom", "brand"));
check("the movie timescale is the audio one, 44100", () =>
  eq(summary.movieTimescale, 44100, "timescale"),
);
check("the file has two tracks", () => eq(summary.tracks.length, 2, "tracks"));
check("the first track is video", () => eq(summary.tracks[0]?.handler, "vide", "handler"));
check("the second track is audio", () => eq(summary.tracks[1]?.handler, "soun", "handler"));
check("the video sample entry is avc1", () => eq(summary.tracks[0]?.sampleEntry, "avc1", "entry"));
check("the video is 320 by 180", () => {
  const video = summary.tracks[0];
  eq(video?.width, 320, "width");
  return eq(video?.height, 180, "height");
});
check("the video timescale is 15360", () => eq(summary.tracks[0]?.timescale, 15360, "timescale"));
check("two seconds is 30720 video units", () => eq(summary.tracks[0]?.durationUnits, 30720, "units"));
check("the codec string carries profile, constraints and level", () =>
  eq(summary.tracks[0]?.codec, "avc1.640015", "codec"),
);
check("the video description is the avcC payload", () =>
  expect((summary.tracks[0]?.description.byteLength ?? 0) > 0, "no description"),
);
check("a track with no description is refused by descriptionBytes", () => {
  const error = throwsSync(
    () => descriptionBytes({ ...summary.tracks[0]!, description: new Uint8Array(0) }),
    "empty description",
  );
  return expect(error.message.includes("no description"), error.message);
});
check("a file with no moov is refused by name", () => {
  const buffer = new Uint8Array(16);
  new DataView(buffer.buffer).setUint32(0, 16);
  buffer.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp only
  const error = throwsSync(() => readMp4(buffer), "no moov");
  return expect(error.message.includes("moov"), error.message);
});
check("a codec string without a description falls back to the entry", () =>
  eq(codecString("avc1", new Uint8Array(0), new BoxReader(bytes), 0, 0), "avc1", "fallback"),
);

// --- the two clocks ---------------------------------------------------------

check("a second of video is 1,000,000 us", () => eq(usFromTimescale(15360, 15360), 1_000_000, "us"));
check("306 units at 15360 is 20 ms", () => eq(usFromTimescale(306, 15360), 19_922, "us"));
check("microseconds convert back to units", () => eq(unitsFromUs(1_000_000, 44100), 44_100, "units"));
check("a zero timescale is refused", () => {
  const error = throwsSync(() => usFromTimescale(1, 0), "zero");
  return expect(error.message.includes("positive"), error.message);
});
check("sixty frames at 30 fps are two seconds", () => {
  const times = frameTimes(60, 30);
  eq(times.length, 60, "count");
  return eq(Math.round((times.at(-1) ?? 0) / 1000), 1967, "last");
});
check("frame timestamps are strictly increasing", () =>
  expect(assertMonotonic(frameTimes(10, 30)) === undefined, "not monotonic"),
);
check("a repeated timestamp is refused", () => {
  const error = throwsSync(() => assertMonotonic([0, 1000, 1000]), "repeat");
  return expect(error.message.includes("not after"), error.message);
});
check("a frame rate of zero is refused", () =>
  expect(throwsSync(() => frameTimes(2, 0), "fps").message.includes("positive"), "message"),
);
check("the plan marks every twelfth chunk as a keyframe", () => {
  const chunks = plannedChunks(36, 30, 12);
  return eq(chunks.map((chunk) => (chunk.key ? "k" : "d")).join(""), "kdddddddddddkdddddddddddkddddddddddd", "plan");
});
check("every chunk carries a duration of one frame", () => {
  const chunks = plannedChunks(4, 25, 2);
  return eq(chunks[0]?.durationUs, 40_000, "duration");
});
check("a seek to a keyframe costs one frame", () => {
  const chunks = plannedChunks(36, 30, 12);
  const key = chunks[12];
  if (!key) throw new Error("no keyframe");
  return eq(seekCost(chunks, key.timestampUs).framesToProcess, 1, "frames");
});
check("a seek to the last frame of a group costs the whole group", () => {
  const chunks = plannedChunks(36, 30, 12);
  const last = chunks[11];
  if (!last) throw new Error("no frame");
  return eq(seekCost(chunks, last.timestampUs).framesToProcess, 12, "frames");
});
check("a seek past the end costs the tail", () => {
  const chunks = plannedChunks(36, 30, 12);
  return eq(seekCost(chunks, 10_000_000).framesToProcess, 12, "frames");
});

// --- the report -------------------------------------------------------------

check("the rendered summary names both tracks", () => {
  const text = renderSummary(summary);
  expect(text.includes("avc1"), "video");
  return expect(text.includes("mp4a"), "audio");
});
check("the fixture passes its own shape assertion", () =>
  expect(assertFixtureShape(summary) === undefined, "threw"),
);
check("a fixture with the wrong size is refused", () => {
  const wrong = {
    ...summary,
    tracks: [{ ...summary.tracks[0]!, width: 640 }],
  };
  const error = throwsSync(() => assertFixtureShape(wrong), "wrong size");
  return expect(error.message.includes("320x180"), error.message);
});

const LEFT: DecoderRun = {
  name: "ffmpeg-wasm",
  frames: 30,
  mediaMs: 2020,
  wallClockMs: 75,
  outputBytes: 24_051,
  startupMs: 140,
  startupBytes: 32_232_419,
};
const RIGHT: DecoderRun = {
  name: "webcodecs",
  frames: 30,
  mediaMs: 2000,
  wallClockMs: 30,
  outputBytes: 18_000,
  startupMs: 0,
  startupBytes: 0,
};

check("the comparison has six rows", () => eq(compareDecoders(LEFT, RIGHT).length, 6, "rows"));
check("the comparison prints both names", () => {
  const text = renderComparison(LEFT, RIGHT);
  return expect(text.includes("ffmpeg-wasm") && text.includes("webcodecs"), text);
});
check("two runs over the same media are comparable", () =>
  expect(assertComparable(LEFT, RIGHT) === undefined, "threw"),
);
check("a different frame count is allowed, and reported", () =>
  expect(assertComparable(LEFT, { ...RIGHT, frames: 60 }) === undefined, "threw"),
);
check("a different duration is not comparable", () => {
  const error = throwsSync(() => assertComparable(LEFT, { ...RIGHT, mediaMs: 9000 }), "media");
  return expect(error.message.includes("media"), error.message);
});

// --- the needs table --------------------------------------------------------

check("the table covers five formats", () => eq(NEEDS.length, 5, "rows"));
check("an unsupported codec falls back", () =>
  eq(verdictFor(NEEDS[0]!, false, true), "fallback", "verdict"),
);
check("a supported codec with a description runs", () =>
  eq(verdictFor(NEEDS[0]!, true, true), "run", "verdict"),
);
check("without a demuxer, a codec with a description stops", () =>
  eq(verdictFor(NEEDS[0]!, true, false), "needs a demuxer", "verdict"),
);

// --- the programs -----------------------------------------------------------

const run = (script: string, args: readonly string[] = []) =>
  spawnSync(process.execPath, [join(HERE, script), ...args], { encoding: "utf8", cwd: process.cwd() });

check("01 parses the fixture and prints the codec path", () => {
  const result = run("01_parse_the_fixture.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("avcC"), result.stdout);
});
check("02 prints the two timescales and the microseconds bug", () => {
  const result = run("02_two_clocks.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("15360"), "timescale");
  return expect(result.stdout.includes("0.000240"), "microseconds");
});
check("03 shows the seek cost growing with the interval", () => {
  const result = run("03_plan_chunks.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("costs  4 frames"), result.stdout);
});
check("04 refuses everything without a demuxer", () => {
  const result = run("04_what_it_needs.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("needs a demuxer"), result.stdout);
});
check("05 refuses to compare when a record is missing", () => {
  const result = run("05_compare_decoders.ts", ["/nonexistent/a.json", "/nonexistent/b.json"]);
  eq(result.status, 1, "exit");
  return expect(result.stderr.includes("no record at"), result.stderr);
});
check("05 compares two records when both exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "zero-backend-ex5e-"));
  const left = join(dir, "left.json");
  const right = join(dir, "right.json");
  writeFileSync(left, JSON.stringify({ engine: "chrome", runs: [{ wallClockMs: 75, outputBytes: 24051, mediaMs: 2020 }] }));
  writeFileSync(
    right,
    JSON.stringify({ engine: "chrome", frames: 30, runs: [{ wallClockMs: 30, outputBytes: 18000, mediaMs: 2000 }] }),
  );
  const result = spawnSync(process.execPath, [join(HERE, "05_compare_decoders.ts"), left, right], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  rmSync(dir, { recursive: true, force: true });
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("frames"), result.stdout);
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
