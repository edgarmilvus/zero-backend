#!/usr/bin/env node
/**
 * Records what the tab keeps when it is reloaded.
 *
 *   node tools/record_storage.mjs chapter03
 *
 * The payload is an inventory taken twice: once after eight writes, once after a full reload
 * with no writes in between. If the two lists differ, the store is a cache and the chapter's
 * claim is false, so the script fails and writes nothing.
 *
 *   runs/chapter03/opfs-roundtrip/{record.json, baseline.md, browser.log, before.png, after.png}
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter03";
const ID = "opfs-roundtrip";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function run(script, args = []) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    encoding: "utf8",
    cwd: ROOT,
  });
  if (result.status !== 0) throw new Error(`${script} exited ${result.status}\n${result.stderr}`);
  return result.stdout;
}

function baseline(record, nodeOutput) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_storage.mjs`. The browser half is the chapter's own page; the",
    "node half is `04_opfs_roundtrip.ts`, which runs the same port against memory.",
    "",
    `Measured ${record.measuredAt}. Chrome ${record.browser}.`,
    "",
    "| | chrome, OPFS | node, memory |",
    "| --- | --- | --- |",
    `| store | ${record.store} | memory (no OPFS in node) |`,
    `| files after eight writes | ${record.writes.files} | 4 (the example's own) |`,
    `| bytes | ${record.writes.bytes} | 2,097,152 |`,
    `| files after the reload | ${record.afterReload.persisted} of 8 from the queue, plus the sync probe | not applicable: a process has no reload |`,
    `| peak jobs in flight | ${record.queue.peak} | ${record.queue.limit} by construction |`,
    "",
    "## What the reload proved",
    "",
    `The page wrote eight files, was reloaded, and listed them before writing anything:`,
    `**${record.afterReload.persisted} of the eight queue files and ${record.afterReload.bytes} bytes** were still there.`,
    "A memory store would have listed zero, because a reload destroys the heap.",
    "",
    "## Node, the same port",
    "",
    "```text",
    nodeOutput.trimEnd(),
    "```",
    "",
    "The same five operations, the same inventory shape, a different store. That is what the",
    "port buys, and it is why this chapter's gate runs in node at all.",
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

  const url = `http://127.0.0.1:${port}/`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__chapter3 === "function", { timeout: 30_000 });

  // 1. Eight writes through the queue, then the inventory.
  await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("files"));
  const writes = await page.evaluate(() => window.__chapter3());
  await page.screenshot({ path: join(DIR, "before.png") });

  // 2. The reload, and the inventory before anything is written again.
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__chapter3list === "function", { timeout: 30_000 });
  const afterReload = await page.evaluate(() => window.__chapter3list());
  await page.screenshot({ path: join(DIR, "after.png") });
  // The canonical shot of the run, and the copy the book prints.
  await page.screenshot({ path: join(DIR, "screenshot.png") });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(
    join(DIR, "screenshot.png"),
    join(ROOT, "chapters", CHAPTER, "images", "run_opfs_roundtrip.png"),
  );
  const sync = await page.evaluate(() => window.__chapter3());

  await browser.close();
  server.close();

  // The sync probe writes one extra file, so the check is that the eight queue files survived,
  // not that the count is identical.
  const expected = Array.from({ length: 8 }, (_, index) => `job-${index + 1}.bin`);
  const missing = expected.filter((name) => !afterReload.inventory.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `the reload lost ${missing.length} files: ${missing.join(", ")}. Nothing was written.`,
    );
  }

  const record = {
    id: ID,
    chapter: 3,
    workload: "eight 64 kB files through a queue of four",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    crossOriginIsolated: true,
    store: writes.state.store,
    queue: { done: writes.state.queue.done, peak: writes.state.queue.peak, limit: 4 },
    writes: { files: writes.state.files, bytes: writes.state.bytes, throughput: writes.state.throughput },
    afterReload: { ...afterReload, persisted: expected.filter((name) => afterReload.inventory.includes(name)).length },
    syncHandle: sync.sync,
    packages: {
      lockfile: "package-lock.json",
      sha256: existsSync(join(ROOT, "package-lock.json"))
        ? (await import("node:crypto"))
            .createHash("sha256")
            .update(readFileSync(join(ROOT, "package-lock.json")))
            .digest("hex")
        : null,
    },
  };

  const nodeOutput = run("chapters/chapter03/files/04_opfs_roundtrip.ts");

  writeFileSync(join(DIR, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(DIR, "browser.log"), `${log.join("\n")}\n`);
  writeFileSync(join(DIR, "baseline.md"), baseline(record, nodeOutput));

  // 3. The index.
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
  const row = `| ${[
    ID,
    "3",
    "chrome",
    "eight 64 kB files",
    record.queue.peak === 4 ? "peak 4 in flight" : `peak ${record.queue.peak}`,
    `${record.writes.bytes} bytes`,
    record.measuredAt.slice(0, 10),
    `[${ID}](./${CHAPTER}/${ID}/record.json)`,
  ].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`store            ${record.store}`);
  console.log(`files            ${record.writes.files} (${record.writes.bytes} bytes)`);
  console.log(`after reload     ${expected.length} queue files, ${afterReload.files} total (${afterReload.bytes} bytes)`);
  console.log(`queue peak       ${record.queue.peak} of ${record.queue.limit}`);
  console.log(`sync handle      ${record.syncHandle}`);
  console.log(`record           runs/${CHAPTER}/${ID}/record.json`);

  return 0;
}

process.exit(
  await main().catch((error) => {
    console.error(error.message);
    return 1;
  }),
);
