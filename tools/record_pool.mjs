#!/usr/bin/env node
/** Records the pool against the main thread: same hash, two places to run it. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter18";
const ID = "worker-pool";
const DIR = join(ROOT, "runs", CHAPTER, ID);
const BUDGET = 100;

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_pool.mjs`. The same FNV hash over six four-megabyte buffers, on the main",
    "thread and in a pool of four workers.",
    "",
    `Measured in Chrome ${record.browser}.`,
    "",
    "| | main thread | pool of four |",
    "| --- | --- | --- |",
    `| total | ${Math.round(record.serial.ms)} ms | ${Math.round(record.pooled.ms)} ms |`,
    `| longest frame | ${Math.round(record.serial.gap)} ms | ${Math.round(record.pooled.gap)} ms |`,
    "",
    "## What the record says",
    "",
    "The pool is faster because there are four cores, and the frame survives because the work left the",
    "thread. The second number is the chapter's: a pool is not a speed trick, it is a way to keep the",
    "longest gap between paints under the budget.",
    "",
    "## What it does not say",
    "",
    "It does not say the work got cheaper. Six buffers of four megabytes are the same bytes either way;",
    "the pool moved them off the thread that draws.",
    "",
  ].join("\n");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const { createServer } = await import(pathToFileURL(join(ROOT, "chapters", CHAPTER, "files", "browser", "serve.mjs")).href);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = server.address().port;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const version = browser.version();
  const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
  const log = [];
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__pooled === "function", null, { polling: 200, timeout: 60_000 });

  // The workers are created once for the page, so the measured run is the warm one; the first run
  // pays for four worker starts and is not the number the chapter quotes.
  await page.evaluate(() => window.__pooled());
  await page.click("#pooled");
  await page.waitForFunction(() => (document.querySelector("#status")?.textContent ?? "").startsWith("pooled:"), null, { polling: 100, timeout: 60_000 });
  const pooled = await page.evaluate(() => window.__lastRun);
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_worker_pool.png"));

  const serial = await page.evaluate(() => window.__serial());
  await browser.close();
  server.close();

  if (pooled.longestFrameMs > BUDGET) throw new Error(`the pool stalled the frame: ${pooled.longestFrameMs.toFixed(0)} ms`);

  const record = {
    id: ID,
    chapter: 18,
    workload: "FNV over six 4 MB buffers, main thread and a pool of four",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    serial: { ms: serial.totalMs, gap: serial.longestFrameMs },
    pooled: { ms: pooled.totalMs, gap: pooled.longestFrameMs },
    budgetMs: BUDGET,
    workers: 4,
    tasks: pooled.tasks,
  };

  writeFileSync(join(DIR, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(DIR, "browser.log"), `${log.join("\n")}\n`);
  writeFileSync(join(DIR, "baseline.md"), baseline(record));

  const indexPath = join(ROOT, "runs", "INDEX.md");
  const header = ["| id | chapter | engine | input | wall clock | peak heap | measured | record |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  const existing = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8").split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| id |") && !l.startsWith("| --- |"))
    : [];
  const link = `[${ID}](./${CHAPTER}/${ID}/record.json)`;
  const row = `| ${[ID, "18", "chrome", "6 x 4 MB", `${record.pooled.ms.toFixed(0)} ms`, `${record.pooled.gap.toFixed(0)} ms frame`, record.measuredAt.slice(0, 10), link].join(" | ")} |`;
  const rows = existing.filter((l) => !l.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`serial            ${record.serial.ms.toFixed(0)} ms, longest frame ${record.serial.gap.toFixed(0)} ms`);
  console.log(`pooled            ${record.pooled.ms.toFixed(0)} ms, longest frame ${record.pooled.gap.toFixed(0)} ms`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
