#!/usr/bin/env node
/** Records the chunked hash of a real file in Chrome. Writes runs/chapter08/<id>/. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter08";
const FILE = process.argv[3] ?? "/tmp/zero1g.bin";
const ID = "chunked-hash";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_stream.mjs`. The page hashed a real file through `File.slice`, one chunk",
    "at a time, with an accumulator of its own: `SubtleCrypto.digest` takes a whole buffer, and the",
    "whole buffer is what this chapter cannot afford.",
    "",
    `Measured in Chrome ${record.browser} over \`${record.file}\`.`,
    "",
    "| | whole file | chunked |",
    "| --- | --- | --- |",
    `| memory held | ${record.sizeBytes} bytes plus the copy | ${record.largestChunkBytes} bytes per read |`,
    `| reads | 1 | ${record.chunks} |`,
    `| wall clock | not measured: the tab cannot hold it | ${record.wallClockMs.toFixed(0)} ms |`,
    `| throughput | — | ${record.megabytesPerSecond.toFixed(0)} MB/s |`,
    "",
    "## What the record says",
    "",
    `A ${(record.sizeBytes / 1e9).toFixed(2)} GB file read in ${record.chunks} slices of at most ` +
      `${(record.largestChunkBytes / 1e6).toFixed(0)} MB, at ${record.megabytesPerSecond.toFixed(0)} MB/s, ` +
      `and every one of its ${record.bytesRead} bytes passed through the loop. The accumulator counts`,
    "bytes because `SubtleCrypto.digest` is not streaming; the node half uses SHA-256, which is.",
    "",
    "## What it does not say",
    "",
    "The browser cannot report its own peak memory the way the node run does, so the memory column is",
    "the plan's arithmetic rather than a measurement. The node record is where the real RSS lives.",
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
  await page.waitForFunction(() => typeof window.__stream === "function", { timeout: 30_000 });
  await page.setInputFiles("#file", FILE);
  await page.waitForFunction(() => (document.querySelector("#status")?.textContent ?? "").includes("ready"));

  const first = await page.evaluate(() => window.__stream());
  const second = await page.evaluate(() => window.__stream());

  await page.waitForFunction(
    () => (document.querySelector("#out")?.textContent ?? "").includes("throughput"),
    { timeout: 300_000 },
  );
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_chunked_hash.png"));

  await browser.close();
  server.close();

  if (first.bytesRead !== second.sizeBytes) {
    throw new Error(`the loop read ${first.bytesRead} of ${second.sizeBytes} bytes; nothing written`);
  }

  const record = {
    id: ID,
    chapter: 8,
    workload: `${(second.sizeBytes / 1e9).toFixed(2)} GB through File.slice`,
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    file: FILE,
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
  const row = `| ${[ID, "8", "chrome", `${(second.sizeBytes / 1e9).toFixed(2)} GB`, `${second.wallClockMs.toFixed(0)} ms`, `${(second.largestChunkBytes / 1e6).toFixed(0)} MB per read`, record.measuredAt.slice(0, 10), `[${ID}](./${CHAPTER}/${ID}/record.json)`].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`file             ${second.name}, ${(second.sizeBytes / 1e9).toFixed(2)} GB`);
  console.log(`chunks           ${second.chunks} of ${second.chunkMb} MB, largest ${(second.largestChunkBytes / 1e6).toFixed(0)} MB`);
  console.log(`wall clock       ${second.wallClockMs.toFixed(0)} ms (${second.megabytesPerSecond.toFixed(0)} MB/s)`);
  console.log(`bytes read       ${second.bytesRead}`);
  console.log(`record           runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
