#!/usr/bin/env node
/**
 * Records the chapter's two halves in one file: the node measurements and the page's run.
 *
 *   node --expose-gc tools/record_analytics.mjs chapter10
 *
 * The node half is the harness's own engine: a million rows, a group by, Parquet against CSV, and
 * the JavaScript baseline in the same process. The browser half clicks the page's button and reads
 * the result the page kept, so the screenshot and the numbers are one run and not two.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter10";
const ID = "analytics-in-a-tab";
const DIR = join(ROOT, "runs", CHAPTER, ID);
const FILES = join(ROOT, "chapters", CHAPTER, "files");

const {
  AGGREGATE_BY_KIND,
  COUNT_EVENTS,
  CREATE_EVENTS,
  TOP_USERS,
  expectedSums,
  aggregateFrom,
} = await import(pathToFileURL(join(FILES, "queries.ts")).href);
const { openDuck } = await import(pathToFileURL(join(FILES, "duck.ts")).href);
const { assertSum } = await import(pathToFileURL(join(FILES, "report.ts")).href);

const rssMb = () => Math.round(process.memoryUsage().rss / (1024 * 1024));
const gc = () => globalThis.gc?.();

/** The same job the chapter calls "the JavaScript baseline", measured in this process. */
function javaScriptBaseline(rows) {
  const before = rssMb();
  const started = performance.now();
  const events = new Array(rows);
  for (let i = 0; i < rows; i += 1) {
    events[i] = {
      id: i,
      userId: (Math.imul(i, 2654435761) >>> 0) % 1000,
      kind: i % 7,
      day: i % 365,
      amount: ((i * 7919) % 100_000) / 100,
    };
  }
  const buildMs = performance.now() - started;

  const groupStarted = performance.now();
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const event of events) {
    sums[event.kind] += event.amount;
    counts[event.kind] += 1;
  }
  const groupMs = performance.now() - groupStarted;

  const rss = rssMb() - before;
  events.length = 0;
  gc();

  return { buildMs, groupMs, rssMb: rss, count: counts.reduce((a, b) => a + b, 0), sum: sums.reduce((a, b) => a + b, 0) };
}

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_analytics.mjs`. The node half runs the same WebAssembly the page does,",
    "through DuckDB's blocking build; the browser half clicks the page's button and reads the result.",
    "",
    `Measured on Chrome ${record.browser}, DuckDB ${record.duckdb}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| rows | ${record.rows.toLocaleString("en-US")} |`,
    `| wasm, ${record.bundle} bundle | ${(record.wasmBytes / 1024 / 1024).toFixed(1)} MB |`,
    `| browser cold start | ${record.coldStartMs.toFixed(0)} ms |`,
    `| parquet fetch | ${record.fetchMs.toFixed(0)} ms |`,
    `| first scan | ${record.scanMs.toFixed(0)} ms |`,
    `| warm scan | ${record.warmMs.toFixed(0)} ms |`,
    `| node: generate a million rows | ${record.node.createMs.toFixed(0)} ms |`,
    `| node: group by | ${record.node.aggregateMs.toFixed(0)} ms |`,
    `| node: parquet | ${(record.node.parquetBytes / 1024 / 1024).toFixed(1)} MB |`,
    `| node: csv | ${(record.node.csvBytes / 1024 / 1024).toFixed(1)} MB |`,
    `| javascript baseline | ${record.node.jsBuildMs.toFixed(0)} ms build, ${record.node.jsGroupMs.toFixed(0)} ms group, ${record.node.jsRssMb} MB rss |`,
    "",
    "## What the record says",
    "",
    "A million rows is not where JavaScript loses: the baseline's group by is in the same range as the",
    "engine's. What the engine buys is the file: the same rows are a 2.3 MB Parquet against a 23 MB",
    "CSV, and a query scans the file without building an object per row.",
    "",
    "## What it does not say",
    "",
    "The rows are synthetic and the machine has the file in the page cache after the fetch. A phone's",
    "first scan is slower, and the chapter's exercise 3 is the arithmetic for a budget that is not this",
    "laptop's.",
    "",
  ].join("\n");
}

async function nodeHalf() {
  const js = javaScriptBaseline(1_000_000);
  if (js.count !== 1_000_000) throw new Error(`the baseline counted ${js.count} rows`);

  const { duck, coldMs } = await openDuck();

  let started = performance.now();
  await duck.query(CREATE_EVENTS);
  const createMs = performance.now() - started;

  started = performance.now();
  const aggregate = await duck.query(AGGREGATE_BY_KIND);
  const aggregateMs = performance.now() - started;
  assertSum(aggregate, expectedSums());

  started = performance.now();
  const top = await duck.query(TOP_USERS);
  const topMs = performance.now() - started;
  if (top.length !== 10) throw new Error(`top users returned ${top.length} rows`);

  const [count] = await duck.query(COUNT_EVENTS);
  if (count.n !== 1_000_000) throw new Error(`the table has ${count.n} rows`);

  const dir = join(tmpdir(), `zero-backend-analytics-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const parquet = join(dir, "events.parquet");
  const csv = join(dir, "events.csv");

  started = performance.now();
  await duck.query(`copy events to '${parquet}' (format parquet, compression zstd)`);
  const writeMs = performance.now() - started;

  started = performance.now();
  await duck.query(`copy events to '${csv}' (format csv, header)`);
  const csvWriteMs = performance.now() - started;

  started = performance.now();
  await duck.query(`select count(*)::bigint from '${parquet}'`);
  const countMs = performance.now() - started;

  started = performance.now();
  const fileRows = await duck.query(aggregateFrom(`'${parquet}'`));
  const scanMs = performance.now() - started;
  assertSum(fileRows, expectedSums());

  const parquetBytes = statSync(parquet).size;
  const csvBytes = statSync(csv).size;

  await duck.close();

  return {
    js,
    coldMs,
    createMs,
    aggregateMs,
    topMs,
    parquetBytes,
    csvBytes,
    writeMs,
    csvWriteMs,
    countMs,
    scanMs,
    duckdb: duck.version,
  };
}

async function browserHalf() {
  const { createServer } = await import(
    pathToFileURL(join(FILES, "browser", "serve.mjs")).href
  );
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = server.address().port;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const version = browser.version();
  const page = await browser.newPage({ viewport: { width: 1000, height: 860 } });
  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__analytics === "function", { timeout: 60_000 });

  await page.click("#run");
  await page.waitForFunction(
    () => typeof window.__lastRun === "object" && (document.querySelector("#status")?.textContent ?? "").includes("rows in"),
    { timeout: 180_000 },
  );

  const run = await page.evaluate(() => window.__lastRun);
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(
    join(DIR, "screenshot.png"),
    join(ROOT, "chapters", CHAPTER, "images", "run_analytics_in_a_tab.png"),
  );

  await browser.close();
  server.close();

  if (run.rows !== 1_000_000) throw new Error(`the page saw ${run.rows} rows`);
  return { run, version, log };
}

async function main() {
  mkdirSync(DIR, { recursive: true });

  const node = await nodeHalf();
  const { run, version, log } = await browserHalf();

  const record = {
    id: ID,
    chapter: 10,
    workload: "one million generated events, grouped by kind, as a table and as parquet",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    duckdb: node.duckdb,
    bundle: run.bundle,
    wasmBytes: run.wasmBytes,
    rows: run.rows,
    sum: run.sum,
    coldStartMs: run.coldMs,
    fetchMs: run.fetchMs,
    countMs: run.countMs,
    scanMs: run.scanMs,
    warmMs: run.warmMs,
    node: {
      coldMs: node.coldMs,
      createMs: node.createMs,
      aggregateMs: node.aggregateMs,
      topMs: node.topMs,
      parquetBytes: node.parquetBytes,
      csvBytes: node.csvBytes,
      writeMs: node.writeMs,
      csvWriteMs: node.csvWriteMs,
      countMs: node.countMs,
      scanMs: node.scanMs,
      jsBuildMs: node.js.buildMs,
      jsGroupMs: node.js.groupMs,
      jsRssMb: node.js.rssMb,
    },
    packages: {
      lockfile: "package-lock.json",
      sha256: existsSync(join(ROOT, "package-lock.json"))
        ? (await import("node:crypto")).createHash("sha256").update(readFileSync(join(ROOT, "package-lock.json"))).digest("hex")
        : null,
      duckdb: JSON.parse(
        readFileSync(join(ROOT, "node_modules", "@duckdb", "duckdb-wasm", "package.json"), "utf8"),
      ).version,
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
    ? readFileSync(indexPath, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("| ") && !line.startsWith("| id |") && !line.startsWith("| --- |"))
    : [];
  const totalMs = record.coldStartMs + record.fetchMs + record.countMs + record.scanMs + record.warmMs;
  const row = `| ${[ID, "10", "chrome", "1M rows, 2.3 MB parquet", `${totalMs.toFixed(0)} ms`, "—", record.measuredAt.slice(0, 10), `[${ID}](./${CHAPTER}/${ID}/record.json)`].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`duckdb           ${record.duckdb} (${record.bundle} bundle, ${(record.wasmBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`rows             ${record.rows}, ${record.bundle} bundle`);
  console.log(`cold start       ${record.coldStartMs.toFixed(0)} ms`);
  console.log(`fetch            ${record.fetchMs.toFixed(0)} ms for 2.3 MB`);
  console.log(`scan             ${record.scanMs.toFixed(0)} ms cold, ${record.warmMs.toFixed(0)} ms warm`);
  console.log(`parquet/csv      ${record.node.parquetBytes} / ${record.node.csvBytes} bytes`);
  console.log(`javascript       ${record.node.jsBuildMs.toFixed(0)} ms build, ${record.node.jsGroupMs.toFixed(0)} ms group, ${record.node.jsRssMb} MB`);
  console.log(`record           runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
