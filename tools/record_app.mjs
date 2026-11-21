#!/usr/bin/env node
/** Records the capstone: one file opened from disk, notes written, a search, and the budget. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter16";
const ID = "one-file-app";
const DIR = join(ROOT, "runs", CHAPTER, ID);
const APP = join(ROOT, "chapters", CHAPTER, "files", "built", "app.html");

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_app.mjs`. It builds the app, opens `built/app.html` from `file://`, writes",
    "two notes and searches them.",
    "",
    `Measured in Chrome ${record.browser}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| file | ${record.bytes} bytes |`,
    `| budget | ${record.budget} bytes |`,
    `| modules | ${record.modules} |`,
    `| notes after the run | ${record.notes} |`,
    `| stored by the page | ${record.storedKb} kB |`,
    "",
    "## What the record says",
    "",
    "A notes app with search, a share link and an export runs from a single HTML file opened from disk,",
    "with no server and no network. The file is a few per cent of the budget the chapter sets.",
    "",
    "## What it does not say",
    "",
    "It does not say the app is complete. The export is the chapter 15 format without a permission, and",
    "the search is a substring scan: both are stated in the chapter.",
    "",
  ].join("\n");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const { buildApp } = await import(pathToFileURL(join(ROOT, "chapters", CHAPTER, "files", "bundle.ts")).href);
  const build = buildApp();
  mkdirSync(dirname(APP), { recursive: true });
  writeFileSync(APP, build.html);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const version = browser.version();
  const page = await browser.newPage({ viewport: { width: 860, height: 820 } });
  const log = [];
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));

  await page.goto(pathToFileURL(APP).href);
  // Polling by timer, not by animation frame: a file:// page in a headless browser can have its
  // frames throttled, and the count is set long before the first frame.
  await page.waitForFunction(
    () => (document.querySelector("#count")?.textContent ?? "").includes("note"),
    null,
    { polling: 200, timeout: 30_000 },
  );

  await page.fill("#title", "The app on a floppy");
  await page.fill("#body", "Written in a file opened from disk, with no server running anywhere.");
  await page.click("button[type=submit]");
  await page.fill("#title", "A second note");
  await page.fill("#body", "Search finds this by the word floppy.");
  await page.click("button[type=submit]");
  await page.click("#find");
  await page.keyboard.type("disk");
  await page.waitForFunction(
    () => (document.querySelector("#count")?.textContent ?? "").startsWith("1 of 2"),
    null,
    { polling: 200, timeout: 10_000 },
  );

  const stored = (await page.textContent("#count")) ?? "";
  const storedKb = Number((stored.match(/([\d.]+) kB/) ?? [])[1] ?? 0);
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_one_file_app.png"));

  await browser.close();

  const record = {
    id: ID,
    chapter: 16,
    workload: "one HTML file opened from disk, two notes, one search",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    bytes: statSync(APP).size,
    budget: build.fits ? 100_000 : 0,
    modules: build.parts.length,
    notes: 2,
    storedKb,
  };
  if (!build.fits) throw new Error(`the app is over budget: ${build.bytes}`);

  writeFileSync(join(DIR, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(DIR, "browser.log"), `${log.join("\n")}\n`);
  writeFileSync(join(DIR, "baseline.md"), baseline(record));

  const indexPath = join(ROOT, "runs", "INDEX.md");
  const header = ["| id | chapter | engine | input | wall clock | peak heap | measured | record |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  const existing = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8").split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| id |") && !l.startsWith("| --- |"))
    : [];
  const link = `[${ID}](./${CHAPTER}/${ID}/record.json)`;
  const row = `| ${[ID, "16", "chrome-file", "1 note app", "—", `${record.storedKb} kB`, record.measuredAt.slice(0, 10), link].join(" | ")} |`;
  const rows = existing.filter((l) => !l.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`file              ${record.bytes} bytes (${((record.bytes / 100_000) * 100).toFixed(0)}% of budget)`);
  console.log(`modules           ${record.modules}`);
  console.log(`notes             ${record.notes}, stored ${record.storedKb} kB`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
