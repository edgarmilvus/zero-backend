#!/usr/bin/env node
/**
 * Records the canvas clip: sixty frames encoded and decoded in Chrome.
 *
 *   node tools/record_clip.mjs chapter05
 *
 *   runs/chapter05/canvas-clip/{record.json, baseline.md, browser.log, screenshot.png}
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter05";
const ID = "canvas-clip";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_clip.mjs`. The clip is drawn, encoded and decoded in the page:",
    "there is no file to demux and no server in the path.",
    "",
    `Measured ${record.measuredAt}. Chrome ${record.browser}, ${record.width}x${record.height}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| codec | ${record.codec} |`,
    `| frames | ${record.frames} at ${record.fps} fps |`,
    `| keyframes | ${record.keyframes}, every ${record.keyEvery} |`,
    `| bytes | ${record.bytes} |`,
    `| encode, warm | ${record.encodeMs.toFixed(1)} ms (${(record.mediaMs / record.encodeMs).toFixed(1)}x real time) |`,
    `| encode, first run | ${record.coldMs.toFixed(1)} ms: the compiler was cold |`,
    `| decode | ${record.decodeMs.toFixed(1)} ms |`,
    `| startup | 0 bytes of WebAssembly: the codec is the platform's |`,
    "",
    "## What the record says",
    "",
    "Encoder and decoder shipped with the browser. Nothing was downloaded, nothing was",
    "installed, and the fourth column of the ledger is zero for the same reason it was in",
    "chapter 4: the bytes never left the tab.",
    "",
    "## What it does not say",
    "",
    "The frames came from a canvas, not from a file. Reading them out of an MP4 needs the",
    "demuxer this chapter only sketches, which is why `05_compare_decoders.ts` compares this",
    "run with chapter 4's only on the two things that are comparable: media duration and",
    "frame count.",
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });

  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__clip === "function", { timeout: 30_000 });

  const first = await page.evaluate(() => window.__clip());
  const second = await page.evaluate(() => window.__clip());
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });

  await browser.close();
  server.close();

  if (first.decodedFrames !== first.frames) {
    throw new Error(`the decoder returned ${first.decodedFrames} of ${first.frames} frames`);
  }
  if (first.bytes <= 0) throw new Error("the encoder produced no bytes; nothing written");
  if (second.keyframes !== first.keyframes) {
    throw new Error(`two runs disagree on keyframes: ${first.keyframes} and ${second.keyframes}`);
  }

  const record = {
    id: ID,
    chapter: 5,
    workload: `${first.frames} canvas frames, ${first.width}x${first.height}, ${first.codec}`,
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    codec: first.codec,
    frames: first.frames,
    keyframes: first.keyframes,
    keyEvery: first.keyEvery,
    fps: first.fps,
    width: first.width,
    height: first.height,
    bytes: first.bytes,
    // The first run pays for the compiler; the second is the job, as in chapter 1's medians.
    encodeMs: second.encodeMs,
    decodeMs: second.decodeMs,
    coldMs: first.encodeMs,
    mediaMs: first.mediaMs,
    decodedFrames: first.decodedFrames,
    runs: [
      { wallClockMs: first.encodeMs, mediaMs: first.mediaMs, outputBytes: first.bytes },
      { wallClockMs: second.encodeMs, mediaMs: second.mediaMs, outputBytes: second.bytes },
    ],
    startupMs: 0,
    startupBytes: 0,
    packages: {
      lockfile: "package-lock.json",
      sha256: existsSync(join(ROOT, "package-lock.json"))
        ? (await import("node:crypto"))
            .createHash("sha256")
            .update(readFileSync(join(ROOT, "package-lock.json")))
            .digest("hex")
        : null,
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
    "5",
    "chrome",
    `${first.frames} canvas frames`,
    `${first.encodeMs.toFixed(0)} ms encode`,
    `${first.bytes} bytes`,
    record.measuredAt.slice(0, 10),
    `[${ID}](./${CHAPTER}/${ID}/record.json)`,
  ].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`codec            ${record.codec} ${record.width}x${record.height}`);
  console.log(`frames           ${record.frames}, ${record.keyframes} keyframes, ${record.bytes} bytes`);
  console.log(`encode           ${record.encodeMs.toFixed(1)} ms warm, ${record.coldMs.toFixed(1)} ms cold`);
  console.log(`decode           ${record.decodeMs.toFixed(1)} ms`);
  console.log(`record           runs/${CHAPTER}/${ID}/record.json`);

  return 0;
}

process.exit(
  await main().catch((error) => {
    console.error(error.message);
    return 1;
  }),
);
