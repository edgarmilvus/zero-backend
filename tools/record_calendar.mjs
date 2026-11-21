#!/usr/bin/env node
/** Records the calendar across the DST change: five occurrences, two offsets, one promise. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter19";
const ID = "calendar-across-dst";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_calendar.mjs`. A weekly 09:00 standup and one flight in Europe/Rome, over",
    "the change on 29 March 2026.",
    "",
    `Measured in Chrome ${record.browser}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| occurrences in the window | ${record.rows} |`,
    `| at 09:00 on the wall | ${record.walls} |`,
    `| before the change (08:00Z) | ${record.before} |`,
    `| after the change (07:00Z) | ${record.after} |`,
    `| .ics bytes | ${record.icsBytes} |`,
    "",
    "## What the record says",
    "",
    "Every occurrence is at 09:00 on the wall, and the instants are not all the same: the ones after",
    "29 March are an hour earlier in UTC. The appointment did not move; the planet did.",
    "",
    "## What it does not say",
    "",
    "It does not say every zone is as simple as Europe/Rome. A zone with a half-hour change, or one that",
    "skips a day, is a rule the runtime carries and this record does not exercise.",
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
  await page.waitForFunction(() => typeof window.__run === "function", null, { polling: 200, timeout: 60_000 });

  await page.click("#run");
  const result = await page.evaluate(() => window.__run());
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_calendar.png"));

  await browser.close();
  server.close();

  const walls = result.rows.filter((row) => row.wall.endsWith("09:00")).length;
  const before = result.rows.filter((row) => row.instant.endsWith("08:00Z")).length;
  const after = result.rows.filter((row) => row.instant.endsWith("07:00Z")).length;
  if (after === 0) throw new Error("the window does not cross the change");

  const record = {
    id: ID,
    chapter: 19,
    workload: "a weekly 09:00 event and one flight, Europe/Rome, March-April 2026",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    rows: result.rows.length,
    walls,
    before,
    after,
    icsBytes: result.icsBytes,
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
  const row = `| ${[ID, "19", "chrome", "5 occurrences", "—", `${record.icsBytes} B .ics`, record.measuredAt.slice(0, 10), link].join(" | ")} |`;
  const rows = existing.filter((l) => !l.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`occurrences       ${record.rows} (${record.walls} at 09:00)`);
  console.log(`instants          ${record.before} at 08:00Z, ${record.after} at 07:00Z`);
  console.log(`ics               ${record.icsBytes} bytes`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
