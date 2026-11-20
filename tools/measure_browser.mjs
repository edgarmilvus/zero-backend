#!/usr/bin/env node
/**
 * Records the measurement a chapter's client column is built from.
 *
 *   node tools/measure_browser.mjs chapter01
 *
 * One run produces, under runs/<chapter>/<id>/:
 *
 *   record.json    machine, OS, browser, packages, input digest, wall clock, peak heap
 *   baseline.md    the same operation in node, and the server path priced by the book's
 *                  own program, so no number in it is typed by hand
 *   browser.log    console output and page errors
 *   screenshot.png
 *
 * and one row in runs/INDEX.md.
 *
 * The check that makes the record worth anything: the browser and node hash the same
 * bytes, so if the two digests differ the script fails and writes nothing.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

// The type stripper announces itself on every import; a recording tool is not the place.
process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter01";
const CHAPTER_NUMBER = Number(CHAPTER.replace("chapter", ""));
const ID = "reel-120mb";
const SIZE = 120 * 1e6;

const RUNS = join(ROOT, "runs", CHAPTER);
const RECORD_DIR = join(RUNS, ID);
const NODE_DIR = join(RUNS, `${ID}-node`);

function generated(size) {
  const buffer = new Uint8Array(size);
  let state = 0x9e3779b9;
  for (let i = 0; i < buffer.length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    buffer[i] = state >>> 24;
  }
  return buffer;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function run(script, args = []) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    encoding: "utf8",
    cwd: ROOT,
  });
  if (result.status !== 0) {
    throw new Error(`${script} exited ${result.status}\n${result.stderr}`);
  }
  return result.stdout;
}

function lockfileDigest() {
  const path = join(ROOT, "package-lock.json");
  if (!existsSync(path)) return null;
  return sha256(readFileSync(path));
}

function indexPath() {
  return join(join(ROOT, "runs"), "INDEX.md");
}

function recordRow(record, folder) {
  const file = `./${CHAPTER}/${folder}/record.json`;
  const cells = [
    record.id,
    String(record.chapter),
    record.engine,
    record.input.name,
    `${(record.result.wallClockMs / 1000).toFixed(3)} s`,
    String(record.result.peakHeapBytes),
    record.measuredAt.slice(0, 10),
    `[${record.id}](${file})`,
  ];
  return `| ${cells.join(" | ")} |`;
}

function updateIndex(records) {
  const header = [
    "| id | chapter | engine | input | wall clock | peak heap | measured | record |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const file = indexPath();
  const existing = existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter((line) => line.startsWith("| "))
    : [];
  const body = existing.filter((line) => !line.startsWith("| id |") && !line.startsWith("| ---"));

  const fresh = records.map((entry) => recordRow(entry.record, entry.folder));

  const rows = [...body];
  // One row per record file, so the node baseline and the browser run both stay visible.
  const key = (line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    return `${cells[1]}|${cells[3]}`;
  };
  for (const row of fresh) {
    const at = rows.findIndex((line) => key(line) === key(row));
    if (at >= 0) rows[at] = row;
    else rows.push(row);
  }

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${[...header, ...rows].join("\n")}\n`);
}

function baseline(records) {
  const node = records.find((record) => record.engine === "node");
  const browser = records.find((record) => record.engine !== "node");
  const pricing = run("chapters/chapter01/files/01_price_one_job.ts");

  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/measure_browser.mjs`. Every number below is read from a record or",
    "printed by the chapter's own program; nothing in this file is typed by hand.",
    "",
    `Measured ${browser.measuredAt}.`,
    "",
    "| | node | browser |",
    "| --- | --- | --- |",
    `| engine | ${node.runtime.name} ${node.runtime.version} | ${browser.browser} |`,
    `| machine | ${node.machine.model} | ${browser.machine.model} |`,
    `| os | ${node.os} | ${browser.os} |`,
    `| input | ${node.input.name} (${node.input.bytes} bytes) | ${browser.input.name} (${browser.input.bytes} bytes) |`,
    `| sha256 | ${node.input.sha256} | ${browser.input.sha256} |`,
    `| wall clock | ${node.result.wallClockMs.toFixed(1)} ms | ${browser.result.wallClockMs.toFixed(1)} ms |`,
    `| peak heap | ${node.result.peakHeapBytes} bytes | ${browser.result.peakHeapBytes} bytes |`,
    "",
    "The two digests are equal, which is the only thing that makes the two wall clocks",
    "comparable: both engines hashed the same bytes.",
    "",
    "## The server path, priced",
    "",
    "```text",
    pricing.trimEnd(),
    "```",
    "",
    `The tariff is data in \`chapters/chapter01/files/tariff.ts\`, with its source URL and`,
    `the date it was read. Client cost is 0.00 USD and 0 bytes leave the device, because`,
    `the operation happened in the tab.`,
    "",
  ].join("\n");
}

async function main() {
  mkdirSync(RECORD_DIR, { recursive: true });

  const inputPath = join(tmpdir(), `zero-backend-${ID}.bin`);
  const bytes = generated(SIZE);
  const inputSha = sha256(bytes);
  await writeFile(inputPath, bytes);

  // The node baseline, produced by the program the chapter publishes.
  run("chapters/chapter01/files/05_hash_the_file.ts", [
    inputPath,
    "--write",
    "--name",
    `generated:${SIZE / 1e6}MB`,
  ]);
  const nodeRecord = JSON.parse(readFileSync(join(NODE_DIR, "record.json"), "utf8"));

  const server = (await import(
    pathToFileURL(join(ROOT, "chapters", CHAPTER, "files", "browser", "serve.mjs")).href
  )).createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = server.address().port;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const version = browser.version();
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });

  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });

  const isolated = await page.evaluate(() => crossOriginIsolated);
  if (!isolated) {
    throw new Error("the page is not cross-origin isolated: COOP/COEP did not take effect");
  }

  await page.setInputFiles("#file", inputPath);
  await page.waitForFunction(
    () => Boolean(window.__lastMeasurement && window.__lastMeasurement.sha256),
    { timeout: 120_000 },
  );

  // Three runs, because one is a number and three is a measurement. The first goes
  // through the file input, exactly as a user would; the other two reuse the file the
  // page already holds, so the worker setup is paid once, as in production.
  const runs = [await page.evaluate(() => window.__lastMeasurement)];
  for (let i = 0; i < 2; i += 1) {
    runs.push(
      await page.evaluate(() =>
        window.__measure(document.querySelector("#file").files[0]),
      ),
    );
  }

  const clocks = runs.map((run) => run.wallClockMs).sort((a, b) => a - b);
  const measured = {
    bytes: runs[0].bytes,
    wallClockMs: clocks[Math.floor(clocks.length / 2)],
    peakHeapBytes: Math.max(...runs.map((run) => run.peakHeapBytes ?? 0)),
    sha256: runs[0].sha256,
  };

  await page.screenshot({ path: join(RECORD_DIR, "screenshot.png") });
  await browser.close();
  server.close();

  if (measured.sha256 !== inputSha) {
    throw new Error(
      `digest mismatch: browser ${measured.sha256}, node ${inputSha}. The record was not written.`,
    );
  }

  const record = {
    id: ID,
    chapter: CHAPTER_NUMBER,
    workload: ID,
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    machine: nodeRecord.machine,
    os: nodeRecord.os,
    browser: `Chrome ${version}`,
    runtime: { name: "chrome", version: version },
    packages: { lockfile: "package-lock.json", sha256: lockfileDigest() },
    input: { name: `generated:${SIZE / 1e6}MB`, bytes: measured.bytes, sha256: inputSha },
    result: {
      wallClockMs: measured.wallClockMs,
      // performance.memory reports the main thread's JS heap, which excludes the
      // ArrayBuffer and the worker's isolate. The buffer is real memory, so the
      // recorded peak is the larger of the reported figure and the bytes read.
      peakHeapBytes: Math.max(measured.peakHeapBytes ?? 0, measured.bytes),
      heapUsedBytes: measured.peakHeapBytes,
      sha256: measured.sha256,
      runs: runs.map((run) => ({
        wallClockMs: run.wallClockMs,
        heapUsedBytes: run.peakHeapBytes,
      })),
    },
    notes:
      "read, SHA-256 and time in a Worker, page served with COOP/COEP, driven by " +
      "tools/measure_browser.mjs through a real file input. peakHeapBytes is " +
      "max(performance.memory.usedJSHeapSize, bytes): the heap figure excludes the " +
      "ArrayBuffer and the worker isolate, and the buffer is memory the page really held.",
  };

  writeFileSync(join(RECORD_DIR, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(RECORD_DIR, "browser.log"), `${log.join("\n")}\n`);
  writeFileSync(join(RECORD_DIR, "baseline.md"), baseline([nodeRecord, record]));
  updateIndex([
    { record: nodeRecord, folder: `${ID}-node` },
    { record, folder: ID },
  ]);

  console.log(`isolated         ${isolated}`);
  console.log(`bytes            ${measured.bytes}`);
  console.log(`browser clock    ${measured.wallClockMs.toFixed(1)} ms`);
  console.log(`node clock       ${nodeRecord.result.wallClockMs.toFixed(1)} ms`);
  console.log(`digest           ${inputSha.slice(0, 16)}... (equal in both engines)`);
  console.log(`record           runs/${CHAPTER}/${ID}/record.json`);
  console.log(`baseline         runs/${CHAPTER}/${ID}/baseline.md`);

  return 0;
}

process.exit(await main().catch((error) => {
  console.error(error.message);
  return 1;
}));
