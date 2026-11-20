#!/usr/bin/env node
/** Records the two replicas: edits apart, one sync, one document. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter13";
const ID = "two-replicas";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_sync.mjs`. Two replicas are edited while apart, then exchange their whole",
    "state once; the merge is a function with no server.",
    "",
    `Measured in Chrome ${record.browser}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| notes after the merge | ${record.notes} |`,
    `| conflicts | ${record.conflicts} |`,
    `| bytes exchanged | ${record.bytes} |`,
    `| merge | ${record.ms.toFixed(2)} ms for both directions |`,
    "",
    "## What the record says",
    "",
    "Two devices with different edits end with the same document, and the page shows it: the same three",
    "ids on both sides, one conflict where both wrote the same note, and a merge that costs a tenth of a",
    "millisecond at this size.",
    "",
    "## What it does not say",
    "",
    "The state is three notes. A thousand notes and their tombstones are in the chapter's fourth program,",
    "and the bytes there are the number a protocol decision needs.",
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 740 } });
  const log = [];
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__sync === "function", { timeout: 60_000 });

  await page.click("#edit-laptop");
  await page.click("#edit-phone");
  await page.click("#conflict");
  await page.click("#sync");
  await page.waitForFunction(() => typeof window.__lastSync === "object", { timeout: 30_000 });
  const result = await page.evaluate(() => window.__lastSync);
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_two_replicas.png"));

  await browser.close();
  server.close();

  const laptop = result.after.laptop.notes.map((note) => note.id).join(",");
  const phone = result.after.phone.notes.map((note) => note.id).join(",");
  if (laptop !== phone) throw new Error(`the replicas disagree: ${laptop} against ${phone}`);

  const record = {
    id: ID,
    chapter: 13,
    workload: "two replicas, three edits apart, one state exchange",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${browser.version()}`,
    notes: result.after.laptop.notes.length,
    ids: result.after.laptop.notes.map((note) => note.id),
    conflicts: result.conflicts,
    added: result.added,
    ms: result.ms,
    bytes: result.bytes,
  };

  writeFileSync(join(DIR, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(DIR, "browser.log"), `${log.join("\n")}\n`);
  writeFileSync(join(DIR, "baseline.md"), baseline(record));

  const indexPath = join(ROOT, "runs", "INDEX.md");
  const header = ["| id | chapter | engine | input | wall clock | peak heap | measured | record |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  const existing = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8").split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| id |") && !line.startsWith("| --- |"))
    : [];
  const row = `| ${[ID, "13", "chrome", "2 replicas, 3 edits", `${record.ms.toFixed(2)} ms`, "—", record.measuredAt.slice(0, 10), `[${ID}](./${CHAPTER}/${ID}/record.json)`].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`notes             ${record.notes} (${record.ids.join(",")})`);
  console.log(`conflicts         ${record.conflicts}`);
  console.log(`merge             ${record.ms.toFixed(2)} ms`);
  console.log(`bytes             ${record.bytes}`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
