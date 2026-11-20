#!/usr/bin/env node
/**
 * Records the two halves of chapter 11: the model in node, and the search in the page.
 *
 *   node tools/record_vectors.mjs chapter11
 *
 * The model needs its package (`npm i -D @huggingface/transformers@4.3.2`) and 23 MB of weights,
 * which the package caches under node_modules. The page needs neither: it reads the vectors the
 * model produced.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter11";
const ID = "search-by-meaning";
const DIR = join(ROOT, "runs", CHAPTER, ID);
const FILES = join(ROOT, "chapters", CHAPTER, "files");

const { loadFixture, evaluate } = await import(pathToFileURL(join(FILES, "fixture.ts")).href);
const { buildIndex, searchIndex } = await import(pathToFileURL(join(FILES, "index.ts")).href);
const { bytesOf, int8Cosine, recallAt, toInt8 } = await import(pathToFileURL(join(FILES, "quantize.ts")).href);
const { topK } = await import(pathToFileURL(join(FILES, "vector.ts")).href);
const { loadModel, embedTexts, MODEL_ID, MODEL_DTYPE, MODEL_DIMS, INSTALL_HINT } = await import(
  pathToFileURL(join(FILES, "embed.ts")).href
);

const MODEL_CACHE = join(ROOT, "node_modules", "@huggingface", "transformers", ".cache");

function modelBytes(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? modelBytes(path) : statSync(path).size;
  }
  return total;
}

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_vectors.mjs`. The vectors are the model's output, committed as",
    "`chapters/chapter11/files/embeddings.json`; the page searches them without running the model.",
    "",
    `Measured in Chrome ${record.browserVersion}, ${record.model} (${record.dtype}, ${record.dims} dimensions).`,
    "",
    "| | value |",
    "| --- | --- |",
    `| model, cached | ${(record.modelBytes / 1024 / 1024).toFixed(0)} MB |`,
    `| load, cached | ${record.loadMs.toFixed(0)} ms |`,
    `| embedded | ${record.texts} texts in ${record.embedMs.toFixed(0)} ms |`,
    `| fixture | ${(record.fixtureBytes / 1024).toFixed(0)} kB |`,
    `| semantic, top five | ${(record.semantic * 100).toFixed(0)} per cent of the right subject |`,
    `| keyword, top five | ${(record.keyword * 100).toFixed(0)} per cent |`,
    `| int8 recall | ${(record.recall5 * 100).toFixed(0)} per cent |`,
    `| int8 size | ${(record.int8Bytes / 1024).toFixed(0)} kB against ${(record.floatBytes / 1024).toFixed(0)} kB |`,
    `| page search | ${record.browser.searchMs.toFixed(1)} ms |`,
    "",
    "## What the record says",
    "",
    `Meaning finds ${(record.semantic * 100).toFixed(0)} per cent of the right subject where words find ` +
      `${(record.keyword * 100).toFixed(0)}, on eight questions the corpus was written to answer. The margin is a`,
    "property of these forty notes and these eight phrasings, and the harness refuses it below twenty points.",
    "",
    "int8 keeps every note of the exact top five, at a quarter of the bytes, and that is a measurement over",
    "this corpus rather than a promise about every one.",
    "",
    "## What it does not say",
    "",
    "The model was already cached: the first run downloads 23 MB and takes seconds. The page does not run",
    "the model at all, which is the chapter's split and not an oversight.",
    "",
  ].join("\n");
}

async function nodeHalf() {
  const fixturePath = join(FILES, "embeddings.json");
  const fixture = await loadFixture(fixturePath);
  if (fixture.model !== MODEL_ID || fixture.dims !== MODEL_DIMS) {
    throw new Error(`the fixture is from ${fixture.model}, the adapter is ${MODEL_ID}`);
  }

  let loaded;
  try {
    loaded = await loadModel();
  } catch (error) {
    throw new Error(`${error.message}\n${INSTALL_HINT}`);
  }

  const started = performance.now();
  const vectors = await embedTexts(loaded.embedder, [...fixture.notes, ...fixture.queries].map((row) => row.text));
  const embedMs = performance.now() - started;
  if (vectors.length !== fixture.notes.length + fixture.queries.length) {
    throw new Error(`the model returned ${vectors.length} vectors`);
  }

  const evaluation = evaluate(fixture, 5);

  const index = buildIndex(fixture.model, fixture.dims, fixture.notes.map((note) => ({ id: note.id, vector: note.vector })));
  const exact = fixture.queries.map((query) => searchIndex(index, query.vector, 5));
  const approximate = fixture.queries.map((query) =>
    topK(
      fixture.notes.map((note) => ({ id: note.id, score: int8Cosine(toInt8(query.vector), toInt8(note.vector)) })),
      5,
    ),
  );

  return {
    loadMs: loaded.loadMs,
    embedMs,
    texts: fixture.notes.length + fixture.queries.length,
    fixtureBytes: statSync(fixturePath).size,
    modelBytes: modelBytes(MODEL_CACHE),
    semantic: evaluation.semantic,
    keyword: evaluation.keyword,
    perQuery: evaluation.perQuery,
    recall5: recallAt(exact, approximate, 5),
    floatBytes: bytesOf(fixture.notes.length, "float32"),
    int8Bytes: bytesOf(fixture.notes.length, "int8"),
  };
}

async function browserHalf() {
  const { createServer } = await import(pathToFileURL(join(FILES, "browser", "serve.mjs")).href);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = server.address().port;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const version = browser.version();
  const page = await browser.newPage({ viewport: { width: 1080, height: 780 } });
  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__search === "function", { timeout: 60_000 });

  await page.click('button[data-query="q1"]');
  await page.waitForFunction(
    () => typeof window.__lastSearch === "object" && (document.querySelector("#status")?.textContent ?? "").includes("/5"),
    { timeout: 60_000 },
  );

  const result = await page.evaluate(() => window.__lastSearch);
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_search_by_meaning.png"));

  await browser.close();
  server.close();

  if (result.semanticHits < 4) throw new Error(`the page found ${result.semanticHits} of five`);
  return { result, version, log };
}

async function main() {
  mkdirSync(DIR, { recursive: true });

  const node = await nodeHalf();
  const { result, version, log } = await browserHalf();

  const record = {
    id: ID,
    chapter: 11,
    workload: "forty notes and eight questions, searched by meaning and by words",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browserVersion: `Chrome ${version}`,
    model: MODEL_ID,
    dtype: MODEL_DTYPE,
    dims: MODEL_DIMS,
    ...node,
    browser: {
      query: result.query,
      semanticHits: result.semanticHits,
      keywordHits: result.keywordHits,
      int8Keeps: result.int8Keeps,
      searchMs: result.searchMs,
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
  const row = `| ${[ID, "11", "chrome", "40 notes, 384 dims", `${result.searchMs.toFixed(1)} ms`, `${(record.floatBytes / 1024).toFixed(0)} kB`, record.measuredAt.slice(0, 10), `[${ID}](./${CHAPTER}/${ID}/record.json)`].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`model             ${record.model} (${record.dtype}), ${(record.modelBytes / 1024 / 1024).toFixed(0)} MB cached`);
  console.log(`load              ${record.loadMs.toFixed(0)} ms`);
  console.log(`embedded          ${record.texts} texts in ${record.embedMs.toFixed(0)} ms`);
  console.log(`semantic/keyword  ${(record.semantic * 100).toFixed(0)}% / ${(record.keyword * 100).toFixed(0)}%`);
  console.log(`int8 recall       ${(record.recall5 * 100).toFixed(0)}% at ${(record.int8Bytes / 1024).toFixed(0)} kB`);
  console.log(`page              ${record.browser.semanticHits}/5 semantic, ${record.browser.keywordHits}/5 keyword, ${record.browser.searchMs.toFixed(1)} ms`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
