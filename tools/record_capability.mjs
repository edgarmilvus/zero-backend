#!/usr/bin/env node
/** Records a minted capability, a recipient that verifies it, and a forgery the signature refuses. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter14";
const ID = "share-link";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_capability.mjs`. The page mints a capability, opens it as the recipient",
    "from the fragment, and then widens the scope in the address bar.",
    "",
    `Measured in Chrome ${record.browser}.`,
    "",
    "| | value |",
    "| --- | --- |",
    `| token | ${record.tokenLength} characters |`,
    `| scope | ${record.scope} |`,
    `| recipient verdict | ${record.recipient} |`,
    `| forged verdict | ${record.forged} (${record.reason}) |`,
    `| verify | ${record.verifyMs.toFixed(2)} ms |`,
    "",
    "## What the record says",
    "",
    "A permission that lives in the link verifies in the page, with the issuer's public key travelling",
    "inside the token and no request to a server. The forgery changes the scope in the address bar and",
    "the signature refuses it, because the signature covers the canonical payload.",
    "",
    "## What it does not say",
    "",
    "It does not say the link can be revoked. A capability in a fragment is a bearer token: whoever has",
    "the link has the permission until it expires, and revocation is the chapter's honest hole.",
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  const log = [];
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__owner === "function", { timeout: 60_000 });

  const owner = await page.evaluate(() => window.__owner());
  await page.evaluate((url) => window.__openLink(url), owner.url);
  const started = performance.now();
  const recipient = await page.evaluate(() => window.__recipient());
  const verifyMs = performance.now() - started;
  const forged = await page.evaluate(() => window.__tamper());

  await page.click("#mint");
  await page.waitForFunction(() => (document.querySelector("#status")?.textContent ?? "").includes("minted"), { timeout: 30_000 });
  await page.click("#open");
  await page.waitForFunction(() => (document.querySelector("#status")?.textContent ?? "").includes("allowed"), { timeout: 30_000 });
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(join(DIR, "screenshot.png"), join(ROOT, "chapters", CHAPTER, "images", "run_share_link.png"));

  await browser.close();
  server.close();

  if (!recipient.allowed) throw new Error(`the recipient refused a valid capability: ${recipient.reason}`);
  if (forged.allowed) throw new Error("the forged capability was allowed");

  const record = {
    id: ID,
    chapter: 14,
    workload: "mint a capability, verify it in the fragment, forge its scope",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${browser.version()}`,
    tokenLength: owner.tokenLength,
    scope: owner.scope,
    recipient: "allowed",
    forged: "refused",
    reason: forged.reason,
    verifyMs,
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
  const row = `| ${[ID, "14", "chrome", "one capability", `${record.verifyMs.toFixed(2)} ms`, "—", record.measuredAt.slice(0, 10), link].join(" | ")} |`;
  const rows = existing.filter((l) => !l.startsWith(`| ${ID} |`));
  rows.push(row);
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`token             ${record.tokenLength} characters`);
  console.log(`scope             ${record.scope}`);
  console.log(`recipient         ${record.recipient}`);
  console.log(`forged            ${record.forged} (${record.reason})`);
  console.log(`verify            ${record.verifyMs.toFixed(2)} ms`);
  console.log(`record            runs/${CHAPTER}/${ID}/record.json`);
  return 0;
}

process.exit(await main().catch((error) => { console.error(error.message); return 1; }));
