#!/usr/bin/env node
/**
 * Records the two loads and one embedding.
 *
 *   node tools/record_worker.mjs chapter12
 *
 * The worker is measured first, while the model is still the least warm it will be; the main-thread
 * load second, so the comparison is honest about the cache being warm for both.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter12";
const ID = "model-in-a-worker";
const DIR = join(ROOT, "runs", CHAPTER, ID);

const manifest = JSON.parse(
  readFileSync(join(ROOT, "chapters", CHAPTER, "files", "model.json"), "utf8"),
);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_worker.mjs`. The page loads the weights from the install's cache, in a",
    "worker and then on the main thread, and embeds one sentence with the worker.",
    "",
    `Measured in Chrome ${record.browser}, ${record.model} (${record.dtype}, ${record.dims} dimensions).`,
    "",
    "| | value |",
    "| --- | --- |",
    `| weights | ${(record.modelBytes / 1024 / 1024).toFixed(1)} MB |`,
    `| worker load | ${record.worker.loadMs.toFixed(0)} ms |`,
    `| worker longest frame | ${record.worker.maxGapMs.toFixed(0)} ms over ${record.worker.frames} frames |`,
    `| main thread load | ${record.main.loadMs.toFixed(0)} ms |`,
    `| main thread longest frame | ${record.main.maxGapMs.toFixed(0)} ms over ${record.main.frames} frames |`,
    `| embedding, first | ${record.embedMs.toFixed(0)} ms |`,
    `| embedding, warm | ${record.warmEmbedMs.toFixed(0)} ms |`,
    `| search, 40 notes | ${record.searchMs.toFixed(2)} ms |`,
    "",
    "## What the record says",
    "",
    "The same model, the same machine, two threads. The worker is slower to be ready and the page keeps",
    `painting: its longest frame is ${record.worker.maxGapMs.toFixed(0)} ms. On the main thread the model is ready ` +
      `${(record.main.loadMs - record.worker.loadMs).toFixed(0)} ms sooner and the page stops for ` +
      `${record.main.maxGapMs.toFixed(0)} ms, which is a freeze a person sees.`,
    "",
    "## What it does not say",
    "",
    "The weights were in the browser's cache for both loads, and the machine is a laptop. On a cold phone",
    "the download is the dominant cost, and the chapter's exercise 3 is that arithmetic.",
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
  const page = await browser.newPage({ viewport: { width: 1100, height: 860 } });
  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__warm === "function", { timeout: 60_000 });

  const worker = await page.evaluate(() => window.__warm());
  const onMain = await page.evaluate(() => window.__main());
  const search = await page.evaluate(() => window.__searchText("where do my files go when I close the tab"));

  // The screenshot is the user's view after a real search: the button, the hits, the times.
  await page.fill("#text", "where do my files go when I close the tab");
  await page.click("#search");
  await page.waitForFunction(() => typeof window.__lastEmbedSearch === "object", { timeout: 60_000 });
  const warm = await page.evaluate(() => window.__lastEmbedSearch);
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_model_in_a_worker.png"));

  await browser.close();
  server.close();

  if (search.hits.length !== 5) throw new Error(`the page returned ${search.hits.length} hits`);
  if (worker.maxGapMs >= 100) throw new Error(`the worker stalled ${worker.maxGapMs.toFixed(0)} ms`);

  const record = {
    id: ID,
    chapter: 12,
    workload: "23 MB of weights in a worker, the same load on the main thread, one embedding",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    model: manifest.model,
    dtype: manifest.dtype,
    dims: manifest.dims,
    modelBytes: manifest.totalBytes,
    worker: { loadMs: worker.loadMs, maxGapMs: worker.frames.maxGapMs, frames: worker.frames.frames },
    main: { loadMs: onMain.loadMs, maxGapMs: onMain.frames.maxGapMs, frames: onMain.frames.frames },
    embedMs: search.embedMs,
    warmEmbedMs: warm.embedMs,
    searchMs: search.searchMs,
    hits: search.hits.map((hit) => hit.id),
    packages: {
      lockfile: "package-lock.json",
      sha256: existsSync(join(ROOT, "package-lock.json"))
        ? (await import("node:crypto")).createHash("sha256").update(readFileSync(join(ROOT, "package-lock.json"))).digest("hex")
        : null,
      transformers: JSON.parse(
        readFileSync(join(ROOT, "node_modules", "@huggingface", "transformers", "package.json"), "utf8"),
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
  const row = `| ${[ID, "12", "chrome", "23 MB weights", `${record.worker.loadMs.toFixed(0)} ms`, "—", record.measuredAt.slice(0, 10), `[${ID}](./${CHAPTER}/${ID}/record.json)`].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`worker            ${record.worker.loadMs.toFixed(0)} ms, longest frame ${record.worker.maxGapMs.toFixed(1)} ms`);
  console.log(`main thread       ${record.main.loadMs.toFixed(0)} ms, longest frame ${record.main.maxGapMs.toFixed(0)} ms`);
  console.log(`embedding         ${record.embedMs.toFixed(0)} ms first, ${record.warmEmbedMs.toFixed(0)} ms warm`);
  console.log(`search            ${record.searchMs.toFixed(2)} ms, hits ${record.hits.join(",")}`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
