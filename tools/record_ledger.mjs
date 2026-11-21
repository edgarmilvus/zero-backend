#!/usr/bin/env node
/** Records the book's ledger: twenty claims, twenty files, one page. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter20";
const ID = "the-ledger";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_ledger.mjs`. The page renders the ledger the build wrote from the book's",
    "twenty claims, each pointing at a record under `runs/`.",
    "",
    `Measured in Chrome ${record.browser}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| claims | ${record.rows} |`,
    `| verified | ${record.ok} |`,
    `| failed | ${record.failed.length === 0 ? "none" : record.failed.join(", ")} |`,
    `| chapters | ${record.chapters} |`,
    "",
    "## What the record says",
    "",
    "Every chapter of the book has a sentence and a file that proves it, and the page reads the verdicts",
    "from the same ledger the gate reads. A chapter whose record moved would be a red row here.",
    "",
    "## What it does not say",
    "",
    "It does not say the sentences are the best sentences. A claim can be true and uninteresting, and no",
    "gate catches that.",
    "",
  ].join("\n");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, [join(ROOT, "chapters", CHAPTER, "files", "05_page.ts")], { stdio: "ignore" });

  const { createServer } = await import(pathToFileURL(join(ROOT, "chapters", CHAPTER, "files", "browser", "serve.mjs")).href);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = server.address().port;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const version = browser.version();
  const page = await browser.newPage({ viewport: { width: 1100, height: 940 } });
  const log = [];
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => (document.querySelector("#status")?.textContent ?? "").includes("claims verified"), null, { polling: 200, timeout: 60_000 });

  const summary = await page.evaluate(() => window.__ledger());
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_ledger.png"));

  await browser.close();
  server.close();

  if (summary.ok !== summary.rows) throw new Error(`the ledger has ${summary.rows - summary.ok} failed claim(s)`);

  const ledger = JSON.parse(readFileSync(join(ROOT, "chapters", CHAPTER, "files", "browser", "ledger.json"), "utf8"));
  const record = {
    id: ID,
    chapter: 20,
    workload: "twenty claims, twenty files, one page",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    rows: summary.rows,
    ok: summary.ok,
    failed: summary.failed,
    chapters: ledger.chapters,
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
  const row = `| ${[ID, "20", "chrome", "20 claims", "—", "20 files", record.measuredAt.slice(0, 10), link].join(" | ")} |`;
  const rows = existing.filter((l) => !l.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`claims            ${record.rows}`);
  console.log(`verified          ${record.ok}`);
  console.log(`chapters          ${record.chapters}`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
