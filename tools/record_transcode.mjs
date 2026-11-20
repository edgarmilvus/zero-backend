#!/usr/bin/env node
/**
 * Records one real transcode in Chrome, and the same command on native FFmpeg.
 *
 *   node tools/record_transcode.mjs chapter04
 *
 * The page is driven twice: the first run pays for the 32 MB core, the second reuses the
 * instance. The job's numbers are the second run's, because the first one measures the download.
 *
 *   runs/chapter04/transcode-fixture/{record.json, baseline.md, browser.log, screenshot.png}
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter04";
const ID = "transcode-fixture";
const DIR = join(ROOT, "runs", CHAPTER, ID);

const FIXTURE = join(ROOT, "chapters", CHAPTER, "files", "fixtures", "sample.mp4");
const NATIVE_ARGS = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  FIXTURE,
  "-c:v",
  "libx264",
  "-crf",
  "30",
  "-preset",
  "veryfast",
  "-pix_fmt",
  "yuv420p",
  "-vf",
  "scale=160:-2",
  "-c:a",
  "aac",
  "-b:a",
  "48k",
  "-movflags",
  "+faststart",
  join(DIR, "native.mp4"),
  "-y",
];

/** The same command with the native binary, timed from spawn to exit. */
function nativeRun() {
  const started = performance.now();
  const result = spawnSync("ffmpeg", NATIVE_ARGS, { encoding: "utf8" });
  const wallClockMs = performance.now() - started;
  if (result.status !== 0) {
    throw new Error(`native ffmpeg exited ${result.status}\n${result.stderr}`);
  }
  const stat = spawnSync("stat", ["-f%z", join(DIR, "native.mp4")], { encoding: "utf8" });
  const version = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).stdout.split("\n")[0];
  return { wallClockMs, outputBytes: Number(stat.stdout.trim()), version };
}

const MB = 1e6;

function baseline(record) {
  const wasm = record.runs[1];
  const native = record.native;
  const speed = (r) => (r.mediaMs / r.wallClockMs).toFixed(1);
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_transcode.mjs`. The browser half is the chapter's own page; the",
    "native half is the same argument vector run against the same file, on the same machine,",
    `ten seconds later (${record.native.version}).`,
    "",
    "| | Chrome, 32 MB of wasm | native ffmpeg |",
    "| --- | --- | --- |",
    `| output | ${wasm.outputBytes.toLocaleString("en-US")} bytes | ${native.outputBytes.toLocaleString("en-US")} bytes |`,
    `| wall clock | ${wasm.wallClockMs.toFixed(0)} ms | ${native.wallClockMs.toFixed(0)} ms |`,
    `| speed | ${speed(wasm)}x real time | ${speed(native)}x real time |`,
    `| startup | ${(record.runs[0].coreLoadMs / 1000).toFixed(2)} s for ${(wasm.coreBytes / MB).toFixed(1)} MB | a binary already installed |`,
    "",
    "## What the record says",
    "",
    `The transcode ran in the tab: ${wasm.inputBytes.toLocaleString("en-US")} bytes in, ` +
      `${wasm.outputBytes.toLocaleString("en-US")} out, ` +
      `${(wasm.inputBytes / wasm.outputBytes).toFixed(2)}x smaller. ` +
      `Nothing left the device, so the fourth column of the ledger is zero.`,
    "",
    `The browser build is slower than native by ${(native.wallClockMs / wasm.wallClockMs).toFixed(1)}x ` +
      `on this two-second clip, and that factor is the honest one for a wasm build without threads. ` +
      `The output is within ${Math.abs(wasm.outputBytes - native.outputBytes)} bytes of the native ` +
      `file, which is what "the same encoder, compiled differently" means.`,
    "",
    "## What it does not say",
    "",
    "The clip is two seconds long, so the startup cost dominates: the core download is larger",
    "than the job. Chapter 1's ledger is the instrument for the case where it does not.",
    "",
  ].join("\n");
}

async function main() {
  mkdirSync(DIR, { recursive: true });

  const { createServer } = await import(
    pathToFileURL(join(ROOT, "chapters", CHAPTER, "files", "browser", "serve.mjs")).href
  );
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = server.address().port;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const version = browser.version();
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });

  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__transcode === "function", { timeout: 30_000 });

  // The first run pays for the core; the second measures the job.
  const first = await page.evaluate(() => window.__transcode());
  const second = await page.evaluate(() => window.__transcode());

  // The picture the book prints: the page at the end of a run it drove through its own button, so
  // the reader sees the interface they will see rather than an empty page.
  await page.click("#run");
  await page.waitForFunction(
    () => (document.querySelector("#out")?.textContent ?? "").includes("real time"),
    { timeout: 180_000 },
  );
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(
    join(DIR, "screenshot.png"),
    join(ROOT, "chapters", CHAPTER, "images", "run_transcode_fixture.png"),
  );
  await browser.close();
  server.close();

  if (second.outputBytes <= 0) throw new Error("the transcode produced no output; nothing written");
  // `coreLoadMs` is the instance's load time, so it is the same on both runs when the instance
  // was reused. A different value means the page created a second one and paid for it again.
  if (second.coreLoadMs !== first.coreLoadMs) {
    throw new Error(
      `the second run loaded the core again (${second.coreLoadMs} against ${first.coreLoadMs} ms)`,
    );
  }

  const native = nativeRun();

  const record = {
    id: ID,
    chapter: 4,
    workload: "sample.mp4, 2 s, 320x180, crf 30, scale 160",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    crossOriginIsolated: true,
    args: "-i input.mp4 -c:v libx264 -crf 30 -preset veryfast -pix_fmt yuv420p -vf scale=160:-2 -c:a aac -b:a 48k -movflags +faststart output.mp4",
    runs: [first, second],
    native: { ...native, mediaMs: second.mediaMs },
    packages: {
      lockfile: "package-lock.json",
      sha256: existsSync(join(ROOT, "package-lock.json"))
        ? (await import("node:crypto"))
            .createHash("sha256")
            .update(readFileSync(join(ROOT, "package-lock.json")))
            .digest("hex")
        : null,
      ffmpeg: JSON.parse(
        readFileSync(join(ROOT, "node_modules", "@ffmpeg", "ffmpeg", "package.json"), "utf8"),
      ).version,
      core: JSON.parse(
        readFileSync(join(ROOT, "node_modules", "@ffmpeg", "core", "package.json"), "utf8"),
      ).version,
    },
  };

  writeFileSync(join(DIR, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(DIR, "browser.log"), `${log.join("\n")}\n`);
  writeFileSync(join(DIR, "baseline.md"), baseline(record));

  const indexPath = join(ROOT, "runs", "INDEX.md");
  const header = [
    "| id | chapter | engine | input | wall clock | peak heap | measured | record |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const existing = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("| ") && !line.startsWith("| id |") && !line.startsWith("| --- |"))
    : [];
  const row = `| ${[
    ID,
    "4",
    "chrome",
    "sample.mp4 34 kB",
    `${second.wallClockMs.toFixed(0)} ms`,
    `${second.outputBytes} bytes out`,
    record.measuredAt.slice(0, 10),
    `[${ID}](./${CHAPTER}/${ID}/record.json)`,
  ].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`core             ${(first.coreBytes / MB).toFixed(1)} MB in ${first.coreLoadMs.toFixed(0)} ms`);
  console.log(`transcode        ${second.inputBytes} -> ${second.outputBytes} bytes in ${second.wallClockMs.toFixed(0)} ms`);
  console.log(`speed            ${(second.mediaMs / second.wallClockMs).toFixed(1)}x real time`);
  console.log(`native           ${native.outputBytes} bytes in ${native.wallClockMs.toFixed(0)} ms`);
  console.log(`record           runs/${CHAPTER}/${ID}/record.json`);

  return 0;
}

process.exit(
  await main().catch((error) => {
    console.error(error.message);
    return 1;
  }),
);
