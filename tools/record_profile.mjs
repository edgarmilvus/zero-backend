#!/usr/bin/env node
/**
 * Records what this machine can do, in Chrome and in node.
 *
 *   node tools/record_profile.mjs chapter02
 *
 * The payload here is not a duration, it is a profile, so the record is named after it:
 *
 *   runs/chapter02/capability-profile/profile.json   what Chrome answered
 *   runs/chapter02/capability-profile/baseline.md    node's profile, the differences, and
 *                                                    what the book does instead, per gap
 *   runs/chapter02/capability-profile/browser.log
 *   runs/chapter02/capability-profile/screenshot.png
 *
 * Both profiles come from the chapter's own programs: node's from
 * `01_detect_here.ts --json`, Chrome's from `window.__profile()` in the page. The comparison
 * is the chapter's `02_compare_profiles.ts` run over the two files, so the baseline is a
 * transcript rather than a paragraph.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter02";
const ID = "capability-profile";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function run(script, args = []) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    encoding: "utf8",
    cwd: ROOT,
  });
  if (result.status !== 0) throw new Error(`${script} exited ${result.status}\n${result.stderr}`);
  return result.stdout;
}

function indexRow(fields) {
  return `| ${fields.join(" | ")} |`;
}

async function main() {
  mkdirSync(DIR, { recursive: true });

  // 1. node's profile, from the chapter's own program.
  const nodeJson = run("chapters/chapter02/files/01_detect_here.ts", ["--json"]);
  const nodeProfile = JSON.parse(nodeJson);
  const nodePath = join(tmpdir(), `zero-backend-node-profile.json`);
  writeFileSync(nodePath, nodeJson);

  // 2. Chrome's profile, from the same detection code, served with the two headers.
  const { createServer } = await import(
    pathToFileURL(join(ROOT, "chapters", CHAPTER, "files", "browser", "serve.mjs")).href
  );
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = server.address().port;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const version = browser.version();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__profile === "function", { timeout: 30_000 });
  const measured = await page.evaluate(() => window.__profile());
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  await browser.close();
  server.close();

  const record = JSON.parse(measured.json);
  record.browser = `Chrome ${version}`;
  record.runtime = { name: "chrome", version };
  record.packages = {
    lockfile: "package-lock.json",
    sha256: existsSync(join(ROOT, "package-lock.json"))
      ? (await import("node:crypto")).createHash("sha256")
          .update(readFileSync(join(ROOT, "package-lock.json")))
          .digest("hex")
      : null,
  };

  writeFileSync(join(DIR, "profile.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(DIR, "browser.log"), `${log.join("\n")}\n`);

  // 3. The comparison, produced by the chapter's own example.
  const chromePath = join(DIR, "profile.json");
  const diff = run("chapters/chapter02/files/02_compare_profiles.ts", [nodePath, chromePath]);

  const gaps = record.capabilities.filter((entry) => entry.verdict !== "present");
  const baseline = [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_profile.mjs`. Both profiles come from the chapter's own",
    "detection code: node through `01_detect_here.ts --json`, Chrome through the same",
    "`detect.ts` served to the page. Nothing here is typed by hand.",
    "",
    `Measured ${record.measuredAt}. Chrome ${version} against node ${process.version}, one machine.`,
    "",
    `## Chrome, on this machine`,
    "",
    gaps.length === 0
      ? `Tier ${record.tier} of 3, with all ${record.capabilities.length} capabilities present.`
      : [
          `Tier ${record.tier} of 3. ${gaps.length} ${
            gaps.length === 1 ? "capability is" : "capabilities are"
          } not present:`,
          "",
          ...gaps.map((entry) => `- **${entry.id}**: ${entry.why}. The book does: ${entry.fallback}`),
        ],
    "",
    "## The two engines differ",
    "",
    "```text",
    diff.trimEnd(),
    "```",
    "",
    "That table is the reason the probe takes its environment as a parameter and the",
    "reason no chapter may assume the profile of the machine it was written on.",
    "",
  ].join("\n");

  writeFileSync(join(DIR, "baseline.md"), baseline);

  // 4. One row in the index, one per profile.
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
  const row = indexRow([
    ID,
    String(2),
    "chrome",
    "capability probe",
    `tier ${record.tier}`,
    `${record.capabilities.length} capabilities`,
    record.measuredAt.slice(0, 10),
    `[${ID}](./${CHAPTER}/${ID}/profile.json)`,
  ]);
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`isolated         ${record.crossOriginIsolated}`);
  console.log(`tier             ${record.tier} of 3`);
  console.log(`not present      ${gaps.map((entry) => entry.id).join(", ") || "none"}`);
  console.log(`profile          runs/${CHAPTER}/${ID}/profile.json`);
  console.log(`baseline         runs/${CHAPTER}/${ID}/baseline.md`);

  return 0;
}

process.exit(
  await main().catch((error) => {
    console.error(error.message);
    return 1;
  }),
);
