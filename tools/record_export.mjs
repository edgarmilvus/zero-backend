#!/usr/bin/env node
/** Records the export: one file, opened by its own reader, then edited and expired. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter15";
const ID = "one-file";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_export.mjs`. The page builds a single HTML file with the notes, a",
    "capability from chapter 14 and the reader inline, then opens it in a sandboxed frame.",
    "",
    `Measured in Chrome ${record.browser}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| notes | ${record.notes} |`,
    `| file | ${(record.bytes / 1024).toFixed(1)} kB |`,
    `| sealed | ${record.sealed} |`,
    `| one note edited after the seal | ${record.tampered} |`,
    `| expired permission | ${record.expired} |`,
    `| reader | ${record.readerMs.toFixed(0)} ms to its verdict |`,
    "",
    "## What the record says",
    "",
    "The file that is opened is the file that decides: the frame renders the notes only when the digest",
    "covers them and the permission verifies and has not expired. Editing one note and rebuilding the",
    "same file changes the verdict to a refusal, and so does minting the permission in the past.",
    "",
    "## What it does not say",
    "",
    "It does not say the file is safe to open from a stranger. The reader is inside it, so a hostile",
    "export can carry a hostile reader; the signature on the notes is not a signature on the code.",
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const log = [];
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__build === "function", { timeout: 60_000 });

  const started = performance.now();
  await page.click("#seal");
  await page.waitForFunction(
    () => (document.querySelector("#status")?.textContent ?? "").startsWith("Notes, verified"),
    { timeout: 30_000 },
  );
  const readerMs = performance.now() - started;
  const sealed = await page.evaluate(() => window.__lastBuild);
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_one_file.png"));

  const tampered = await page.evaluate(() => window.__tamper());
  const expired = await page.evaluate(() => window.__build("expired"));

  await browser.close();
  server.close();

  if (!sealed.verdict.startsWith("Notes, verified")) throw new Error(`the sealed file was refused: ${sealed.verdict}`);
  if (tampered.verdict.startsWith("Notes, verified")) throw new Error("the edited file verified");
  if (expired.verdict.startsWith("Notes, verified")) throw new Error("the expired file verified");

  const record = {
    id: ID,
    chapter: 15,
    workload: "one HTML file with twelve notes, a permission and a reader",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    notes: sealed.notes,
    bytes: sealed.bytes,
    digest: sealed.digest,
    sealed: sealed.verdict,
    tampered: tampered.verdict,
    expired: expired.verdict,
    readerMs,
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
  const row = `| ${[ID, "15", "chrome", `${record.notes} notes, one file`, `${record.readerMs.toFixed(0)} ms`, `${(record.bytes / 1024).toFixed(1)} kB`, record.measuredAt.slice(0, 10), link].join(" | ")} |`;
  const rows = existing.filter((l) => !l.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`notes             ${record.notes}`);
  console.log(`file              ${(record.bytes / 1024).toFixed(1)} kB`);
  console.log(`sealed            ${record.sealed}`);
  console.log(`tampered          ${record.tampered}`);
  console.log(`expired           ${record.expired}`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
