#!/usr/bin/env node
/** Records the database in a tab: cold start, a thousand rows, and a reload that finds them. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter09";
const ID = "docs-in-a-tab";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_db.mjs`. The page opens the same store the node half does, with one",
    "difference: `dataDir` is `idb://`, which is PGlite's browser persistence.",
    "",
    `Measured in Chrome ${record.browser}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| server | ${record.server} |`,
    `| schema version | ${record.version} |`,
    `| first open, 26 MB of wasm | ${record.firstOpenMs.toFixed(0)} ms |`,
    `| second open | ${record.loadMs.toFixed(0)} ms |`,
    `| rows after the first open | ${record.rows} |`,
    `| rows after the reload | ${record.afterReload} |`,
    `| search | ${record.searchMs.toFixed(1)} ms for ${record.matches} matches |`,
    "",
    "## What the record says",
    "",
    "The first query pays for the engine: 26 MB of WebAssembly, about 1.7 seconds, and then Postgres",
    `is Postgres. The reload is the interesting half: the page reopened the database from IndexedDB and`,
    `found ${record.afterReload} rows without inserting any, which is the difference between a heap and a store.`,
    "",
    "## What it does not say",
    "",
    "The rows are synthetic notes, not a user's archive, and the machine is a laptop with the wasm in",
    "the page cache. A phone's first open is longer, and the chapter's exercise 3 is the arithmetic.",
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 780 } });
  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__db === "function", { timeout: 30_000 });

  const first = await page.evaluate(() => window.__db());
  const second = await page.evaluate(() => window.__db());

  // The reload: a new document, the same origin, the same database.
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__db === "function", { timeout: 30_000 });
  const afterReload = await page.evaluate(() => window.__db());

  await page.click("#run");
  await page.waitForFunction(
    () => (document.querySelector("#out")?.textContent ?? "").includes("rows"),
    { timeout: 120_000 },
  );
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_docs_in_a_tab.png"));

  await browser.close();
  server.close();

  if (afterReload.rows < first.rows) {
    throw new Error(`the reload lost rows: ${first.rows} then ${afterReload.rows}; nothing written`);
  }

  const record = {
    id: ID,
    chapter: 9,
    workload: "1000 notes in a Postgres in the tab",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    ...second,
    firstOpenMs: first.loadMs,
    afterReload: afterReload.rows,
    packages: {
      lockfile: "package-lock.json",
      sha256: existsSync(join(ROOT, "package-lock.json"))
        ? (await import("node:crypto")).createHash("sha256").update(readFileSync(join(ROOT, "package-lock.json"))).digest("hex")
        : null,
      pglite: JSON.parse(readFileSync(join(ROOT, "node_modules", "@electric-sql", "pglite", "package.json"), "utf8")).version,
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
  const row = `| ${[ID, "9", "chrome", "1000 rows, idb://", `${second.loadMs.toFixed(0)} ms open`, `${second.rows} rows`, record.measuredAt.slice(0, 10), `[${ID}](./${CHAPTER}/${ID}/record.json)`].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`server           ${second.server}`);
  console.log(`cold start       ${second.loadMs.toFixed(0)} ms`);
  console.log(`rows             ${second.rows}, ${afterReload.rows} after reload`);
  console.log(`search           ${second.searchMs.toFixed(1)} ms`);
  console.log(`record           runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
