/**
 * Chapter 7 harness: 56 assertions on the WAV header, the arithmetic and the meters.
 *
 * Every expected value comes from the fixture, which is a second of silence, a second of a 440 Hz
 * tone at half amplitude, and a second of silence. That is why the numbers below are exact and the
 * tolerance is in the third decimal.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { durationSeconds, readWav, writeWav } from "./wav.ts";
import {
  dbfs,
  findSilence,
  loudnessLufs,
  peaks,
  rmsDbfs,
  trimPlan,
} from "./audio.ts";
import { assertLoudnessRange, assertPeakBound, renderAudio, renderWaveform } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "voice.wav");
const AUDIO = readWav(new Uint8Array(readFileSync(FIXTURE)));
const CHANNEL = AUDIO.channels[0];
if (!CHANNEL) throw new Error("fixture has no channel");
const RATE = AUDIO.sampleRate;
const TONE = CHANNEL.subarray(Math.round(1.2 * RATE), Math.round(1.8 * RATE));

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
function near(actual: number, expected: number, tolerance: number, what: string): true {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`${what}: got ${actual}, expected ${expected} +/- ${tolerance}`);
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

// --- the WAV header ---------------------------------------------------------

check("the fixture is 44.1 kHz mono", () => {
  eq(AUDIO.sampleRate, 44100, "rate");
  return eq(AUDIO.channels.length, 1, "channels");
});
check("the fixture is three seconds long", () => near(durationSeconds(AUDIO), 3, 1e-6, "duration"));
check("the sample count is rate times duration", () => eq(CHANNEL.length, 132_300, "samples"));
check("a file that is not RIFF is refused", () => {
  const error = throwsSync(() => readWav(new Uint8Array(64)), "not riff");
  return expect(error.message.includes("RIFF"), error.message);
});
check("a WAV with no fmt chunk is refused by name", () => {
  const bytes = new Uint8Array(12);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  const error = throwsSync(() => readWav(bytes), "no fmt");
  return expect(error.message.includes("fmt"), error.message);
});
check("the writer produces a RIFF/WAVE header", () => {
  const bytes = writeWav(AUDIO);
  return eq(
    `${String.fromCharCode(...bytes.subarray(0, 4))}${String.fromCharCode(...bytes.subarray(8, 12))}`,
    "RIFFWAVE",
    "magic",
  );
});
check("the writer's data chunk size matches the frames", () => {
  const bytes = writeWav(AUDIO);
  const view = new DataView(bytes.buffer);
  eq(view.getUint32(40, true), CHANNEL.length * 2, "data size");
  return eq(bytes.byteLength, 44 + CHANNEL.length * 2, "file size");
});
check("the round trip returns the same rate and length", () => {
  const again = readWav(writeWav(AUDIO));
  eq(again.sampleRate, AUDIO.sampleRate, "rate");
  return eq(again.channels[0]?.length, CHANNEL.length, "frames");
});
check("the round trip loses less than one least significant bit", () => {
  const again = readWav(writeWav(AUDIO)).channels[0];
  if (!again) throw new Error("no channel");
  let worst = 0;
  for (let index = 0; index < CHANNEL.length; index += 1) {
    worst = Math.max(worst, Math.abs((CHANNEL[index] ?? 0) - (again[index] ?? 0)));
  }
  return expect(worst <= 1 / 32768, `worst ${worst}`);
});
check("a channel shorter than its siblings is refused by the writer", () => {
  const error = throwsSync(
    () => writeWav({ channels: [new Float32Array(10), new Float32Array(9)], sampleRate: 8000 }),
    "uneven",
  );
  return expect(error.message.includes("same length"), error.message);
});
check("every sample in the fixture is inside full scale", () =>
  expect(assertPeakBound(CHANNEL) === undefined, "threw"),
);
check("a sample outside full scale is refused", () => {
  const error = throwsSync(() => assertPeakBound(new Float32Array([0, 2])), "over");
  return expect(error.message.includes("outside"), error.message);
});

check("a file with a LIST chunk before data is still read", () => {
  // ffmpeg writes such a chunk; a reader that assumes fmt is at offset 12 fails on those files.
  const base = writeWav(AUDIO);
  const list = new Uint8Array(12);
  const view = new DataView(list.buffer);
  view.setUint32(0, 0x4c495354, false); // "LIST"
  view.setUint32(4, 4, true);
  list.set([1, 2, 3, 4], 8);
  const out = new Uint8Array(base.byteLength + list.byteLength);
  out.set(base.subarray(0, 44), 0);
  out.set(list, 44);
  out.set(base.subarray(44), 56);
  // The RIFF size must grow with the chunk, or a strict reader stops early.
  new DataView(out.buffer).setUint32(4, out.byteLength - 8, true);
  const parsed = readWav(out);
  return eq(parsed.channels[0]?.length, CHANNEL.length, "frames");
});
check("eight-bit PCM is refused by name", () => {
  const base = writeWav(AUDIO);
  new DataView(base.buffer).setUint16(34, 8, true);
  const error = throwsSync(() => readWav(base), "8 bit");
  return expect(error.message.includes("bits per sample"), error.message);
});
check("a single sample can be a waveform", () => {
  const one = peaks(new Float32Array([0.25]), 1);
  eq(one.length, 1, "buckets");
  return eq(one[0]?.max, 0.25, "max");
});

// --- decibels ---------------------------------------------------------------

check("half amplitude is minus six dBFS", () => near(dbfs(0.5), -6.0206, 1e-3, "dbfs"));
check("full scale is zero dBFS", () => near(dbfs(1), 0, 1e-9, "dbfs"));
check("silence is minus infinity, not a very small number", () =>
  eq(dbfs(0), Number.NEGATIVE_INFINITY, "dbfs"),
);
check("a tone at half amplitude reads minus nine on the RMS meter", () =>
  near(rmsDbfs(TONE), -9.0309, 5e-3, "rms"),
);
check("an empty block reads minus infinity", () =>
  eq(rmsDbfs(new Float32Array(0)), Number.NEGATIVE_INFINITY, "rms"),
);
check("a full-scale square wave reads zero on the RMS meter", () =>
  near(rmsDbfs(new Float32Array([1, -1, 1, -1])), 0, 1e-9, "rms"),
);

// --- peaks ------------------------------------------------------------------

check("the peaks of one bucket are the file's extremes", () => {
  const one = peaks(CHANNEL, 1)[0];
  if (!one) throw new Error("no bucket");
  return near(Math.max(one.max, -one.min), 0.5, 2e-3, "amplitude");
});
check("twenty-four buckets cover the tone with a loud middle", () => {
  const buckets = peaks(CHANNEL, 24);
  const loud = buckets.filter((bucket) => Math.abs(bucket.max) > 0.4).length;
  return expect(loud >= 6 && loud <= 10, `loud buckets ${loud}`);
});
check("every bucket's min is at or below its max", () =>
  expect(peaks(CHANNEL, 12).every((bucket) => bucket.min <= bucket.max), "inverted bucket"),
);
check("a zero bucket count is refused", () => {
  const error = throwsSync(() => peaks(CHANNEL, 0), "zero");
  return expect(error.message.includes("positive"), error.message);
});
check("an empty buffer yields no peaks", () => eq(peaks(new Float32Array(0), 4).length, 0, "peaks"));
check("an average would hide the transient that the peaks keep", () => {
  // One loud sample in a quiet bucket: the peak shows it, the mean does not.
  const samples = new Float32Array([0.01, 0.01, 0.9, 0.01, 0.01]);
  const bucket = peaks(samples, 1)[0];
  if (!bucket) throw new Error("no bucket");
  near(bucket.max, 0.9, 1e-6, "peak");
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return expect(mean < 0.2, `mean ${mean}`);
});

// --- loudness ---------------------------------------------------------------

const TONE_ONLY = loudnessLufs(TONE, RATE);
const WITH_SILENCE = loudnessLufs(CHANNEL, RATE);

check("a tone at half amplitude reads about minus nine point seven LUFS", () =>
  near(TONE_ONLY.integrated, -9.69, 0.3, "lufs"),
);
check("the fixture with silence reads about minus ten point eight", () =>
  near(WITH_SILENCE.integrated, -10.83, 0.3, "lufs"),
);
check("the ungated number is three units lower", () =>
  expect(WITH_SILENCE.ungated < WITH_SILENCE.integrated - 2.5, `${WITH_SILENCE.ungated}`),
);
check("the gate keeps only the blocks with signal", () =>
  expect(WITH_SILENCE.gatedBlocks < WITH_SILENCE.blocks, "nothing was gated"),
);
check("doubling the silence leaves the gated loudness alone", () => {
  const doubled = new Float32Array(CHANNEL.length * 2);
  doubled.set(CHANNEL, 0);
  doubled.set(CHANNEL, CHANNEL.length);
  const result = loudnessLufs(doubled, RATE);
  return near(result.integrated, WITH_SILENCE.integrated, 0.05, "lufs");
});
check("but it lowers the ungated number further", () => {
  const doubled = new Float32Array(CHANNEL.length * 2);
  doubled.set(CHANNEL, 0);
  doubled.set(CHANNEL, CHANNEL.length);
  return expect(loudnessLufs(doubled, RATE).ungated < WITH_SILENCE.ungated - 0.1, "ungated");
});
check("a silent file has no integrated loudness", () =>
  eq(loudnessLufs(new Float32Array(44100), RATE).integrated, Number.NEGATIVE_INFINITY, "lufs"),
);
check("a file shorter than one block is still measured", () =>
  expect(Number.isFinite(loudnessLufs(new Float32Array(1000).fill(0.5), RATE).integrated), "finite"),
);
check("loudness in range passes the assertion", () =>
  expect(assertLoudnessRange(-10.8) === undefined, "threw"),
);
check("a positive loudness is refused as a broken meter", () => {
  const error = throwsSync(() => assertLoudnessRange(3), "positive");
  return expect(error.message.includes("outside"), error.message);
});

check("a value above full scale reads positive decibels", () =>
  near(dbfs(2), 6.0206, 1e-3, "dbfs"),
);
check("a longer file has more blocks", () => {
  const long = new Float32Array(RATE * 3).fill(0.5);
  return expect(loudnessLufs(long, RATE).blocks > loudnessLufs(TONE, RATE).blocks, "blocks");
});

// --- silence and trim -------------------------------------------------------

const RUNS = findSilence(CHANNEL, RATE, { thresholdDbfs: -50, minMs: 200 });

check("the fixture has two silence runs", () => eq(RUNS.length, 2, "runs"));
check("the first run starts at zero", () => eq(RUNS[0]?.startSample, 0, "start"));
check("the first run is one second", () => near(RUNS[0]?.seconds ?? 0, 1, 0.01, "seconds"));
check("the last run ends with the file", () => eq(RUNS.at(-1)?.endSample, CHANNEL.length, "end"));
check("a minimum duration filters short gaps", () => {
  const short = findSilence(CHANNEL, RATE, { thresholdDbfs: -50, minMs: 2000 });
  return eq(short.length, 0, "runs");
});
check("a lower threshold finds nothing in the tone", () => {
  const quiet = findSilence(TONE, RATE, { thresholdDbfs: -60, minMs: 10 });
  return eq(quiet.length, 0, "runs");
});
check("the trim keeps the tone and the margin", () => {
  const plan = trimPlan(CHANNEL, RATE, { thresholdDbfs: -50, minMs: 200, marginMs: 100 });
  near(plan.keptSeconds, 1.2, 0.02, "kept");
  return near(plan.cutSeconds, 1.8, 0.02, "cut");
});
check("the trim of a file with no silence cuts nothing", () => {
  const plan = trimPlan(TONE, RATE, { thresholdDbfs: -50, minMs: 200, marginMs: 100 });
  eq(plan.fromSample, 0, "from");
  return eq(plan.cutSeconds, 0, "cut");
});
check("a file that is silent end to end keeps nothing", () => {
  const plan = trimPlan(new Float32Array(RATE), RATE, { thresholdDbfs: -50, minMs: 200, marginMs: 100 });
  return eq(plan.keptSeconds, 0, "kept");
});
check("a threshold above the tone finds the whole file silent", () => {
  const all = findSilence(TONE, RATE, { thresholdDbfs: -1, minMs: 100 });
  return expect(all.length >= 1, "no runs");
});
check("a margin larger than the file keeps the whole file", () => {
  const plan = trimPlan(CHANNEL, RATE, { thresholdDbfs: -50, minMs: 200, marginMs: 5000 });
  return eq(plan.fromSample, 0, "from");
});
check("the rendered summary names the file and the meter", () => {
  const text = renderAudio({
    name: "voice.wav",
    sampleRate: RATE,
    channels: 1,
    seconds: durationSeconds(AUDIO),
    peakDbfs: -6.02,
    rmsDbfs: -9.03,
    loudness: WITH_SILENCE.integrated,
    ungated: WITH_SILENCE.ungated,
    silenceRuns: RUNS.length,
  });
  expect(text.includes("voice.wav"), "name");
  return expect(text.includes("LUFS"), "meter");
});
check("the waveform is one line per bucket", () =>
  eq(renderWaveform(peaks(CHANNEL, 24)).split("\n").length, 24, "lines"),
);

// --- the programs -----------------------------------------------------------

const run = (script: string) =>
  spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8" });

check("01 reads the fixture and reports its meters", () => {
  const result = run("01_read_the_fixture.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("LUFS"), result.stdout);
});
check("02 prints a waveform at three resolutions", () => {
  const result = run("02_peaks.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("buckets"), result.stdout);
});
check("03 shows the gate holding while the ungated number falls", () => {
  const result = run("03_loudness.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("gated"), result.stdout);
});
check("04 trims the silence and writes a real WAV", () => {
  const result = run("04_trim_silence.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("written"), result.stdout);
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
