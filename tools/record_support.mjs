#!/usr/bin/env node
/** Records a support report filed from the page: no note text, one category, a checksum. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter17";
const ID = "support-report";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_support.mjs`. The page builds a report from diagnostics, with one note's",
    "words given to the redactor as secrets.",
    "",
    `Measured in Chrome ${record.browser}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| report | ${record.bytes} bytes |`,
    `| category | ${record.category} |`,
    `| leaked | ${record.leaked} |`,
    `| checksum | ${record.checksum.slice(0, 24)}... |`,
    "",
    "## What the record says",
    "",
    "The report carries a build, an environment, two counts and a redacted message, and nothing that came",
    "out of a note. The page asserts it before it offers the file, and the record reads that assertion.",
    "",
    "## What it does not say",
    "",
    "It does not say the redactor is complete. A short word from a body can survive if it is also English;",
    "the design keeps note text out of the report's fields and scrubs the one free-text field.",
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
  const page = await browser.newPage({ viewport: { width: 900, height: 780 } });
  const log = [];
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__fileReport === "function", { timeout: 60_000 });

  await page.click("#send");
  await page.waitForFunction(
    () => (document.querySelector("#status")?.textContent ?? "").includes("import-failed"),
    null,
    { polling: 200, timeout: 30_000 },
  );

  const result = await page.evaluate(() => window.__lastReport);
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_support_report.png"));

  await browser.close();
  server.close();

  if (result.leaked) throw new Error("the report contains note text");

  const record = {
    id: ID,
    chapter: 17,
    workload: "one support report from diagnostics with a redacted message",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    bytes: result.bytes,
    category: result.value.category,
    severity: result.value.severity,
    checksum: result.report.checksum,
    leaked: result.leaked,
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
  const row = `| ${[ID, "17", "chrome", "1 report", "—", `${record.bytes} B`, record.measuredAt.slice(0, 10), link].join(" | ")} |`;
  const rows = existing.filter((l) => !l.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`report            ${record.bytes} bytes`);
  console.log(`category          ${record.severity} ${record.category}`);
  console.log(`leaked            ${record.leaked}`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
