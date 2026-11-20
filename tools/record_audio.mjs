#!/usr/bin/env node
/** Records the audio page: read, meter, trim. Writes runs/chapter07/voice-trim/. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter07";
const ID = "voice-trim";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_audio.mjs`. The page reads PCM with the chapter's own header parser and",
    "meters it with the chapter's own functions: no decoder, no AudioContext, no server.",
    "",
    `Measured ${record.measuredAt}. Chrome ${record.browser}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| sample rate | ${record.sampleRate} Hz |`,
    `| duration | ${record.seconds.toFixed(2)} s |`,
    `| peak | ${record.peakDbfs.toFixed(2)} dBFS |`,
    `| rms of the tone | ${record.rmsDbfs.toFixed(2)} dBFS |`,
    `| loudness | ${record.loudness.toFixed(2)} LUFS, ${record.ungated.toFixed(2)} ungated |`,
    `| silence runs | ${record.silenceRuns} |`,
    `| kept / cut | ${record.keptSeconds.toFixed(2)} s / ${record.cutSeconds.toFixed(2)} s |`,
    `| trimmed file | ${record.trimmedBytes} bytes from ${record.originalBytes} |`,
    "",
    "## What the record says",
    "",
    `The tone is at half amplitude, so the peak is -6.02 dBFS and the RMS is -9.03: a sine reads three`,
    `decibels under its peak, which is the arithmetic the first exercise is about.`,
    "",
    `Gated and ungated loudness differ by ${(record.loudness - record.ungated).toFixed(2)} units because a third of`,
    "the file is silence. The gate is what stops that silence from lowering the number.",
    "",
    "## What it does not say",
    "",
    "The file is three seconds of a synthetic tone, not a podcast. The meters are correct for it and the",
    "chapter prints the tolerance a reader should expect from a simplified R128 implementation.",
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__audio === "function", { timeout: 30_000 });
  const first = await page.evaluate(() => window.__audio());
  const second = await page.evaluate(() => window.__audio());
  await page.click("#run");
  await page.waitForFunction(
    () => (document.querySelector("#out")?.textContent ?? "").includes("LUFS"),
    { timeout: 60_000 },
  );
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(
    join(DIR, "screenshot.png"),
    join(ROOT, "chapters", CHAPTER, "images", "run_voice_trim.png"),
  );

  await browser.close();
  server.close();

  if (first.keptSeconds <= 0) throw new Error("the trim kept nothing; nothing written");
  if (second.trimmedBytes !== first.trimmedBytes) throw new Error("two runs disagree on the trimmed size");

  const record = {
    id: ID,
    chapter: 7,
    workload: "voice.wav, 3 s of 44.1 kHz PCM, trimmed",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    formats: {},
    ...second,
    packages: {
      lockfile: "package-lock.json",
      sha256: existsSync(join(ROOT, "package-lock.json"))
        ? (await import("node:crypto")).createHash("sha256").update(readFileSync(join(ROOT, "package-lock.json"))).digest("hex")
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
    ? readFileSync(indexPath, "utf8").split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| id |") && !l.startsWith("| --- |"))
    : [];
  const row = `| ${[ID, "7", "chrome", "voice.wav 258 kB", `${second.loudness.toFixed(2)} LUFS`, `${second.cutSeconds.toFixed(2)} s cut`, record.measuredAt.slice(0, 10), `[${ID}](./${CHAPTER}/${ID}/record.json)`].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`peak             ${second.peakDbfs.toFixed(2)} dBFS`);
  console.log(`rms              ${second.rmsDbfs.toFixed(2)} dBFS`);
  console.log(`loudness         ${second.loudness.toFixed(2)} LUFS (${second.ungated.toFixed(2)} ungated)`);
  console.log(`kept / cut       ${second.keptSeconds.toFixed(2)} s / ${second.cutSeconds.toFixed(2)} s`);
  console.log(`record           runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
