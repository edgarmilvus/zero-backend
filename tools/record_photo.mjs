#!/usr/bin/env node
/**
 * Records the image pipeline: one HEIC and one JPEG through decode, strip, resize, encode.
 *
 *   node tools/record_photo.mjs chapter06
 *
 *   runs/chapter06/image-pipeline/{record.json, baseline.md, browser.log, screenshot.png}
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

process.removeAllListeners("warning");
process.on("warning", () => {});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAPTER = process.argv[2] ?? "chapter06";
const ID = "image-pipeline";
const DIR = join(ROOT, "runs", CHAPTER, ID);

function baseline(record) {
  const [heic, jpeg] = record.results;
  return [
    `# Baseline: ${ID}`,
    "",
    "Written by `tools/record_photo.mjs`. Both pictures are the same frame, one encoded as HEIC by",
    "macOS and one as JPEG by ffmpeg, and both go through the same four steps.",
    "",
    `Measured ${record.measuredAt}. Chrome ${record.browser}.`,
    "",
    "| | cover.heic | cover.jpg |",
    "| --- | --- | --- |",
    `| input | ${heic.inputBytes} bytes | ${jpeg.inputBytes} bytes (one APP1 injected) |`,
    `| decode, warm | ${heic.decodeMs.toFixed(1)} ms, 9 MB of wasm | ${jpeg.decodeMs.toFixed(1)} ms, the platform's |`,
    `| decode, first run | ${record.cold[0].decodeMs.toFixed(1)} ms, the module's instantiation | ${record.cold[1].decodeMs.toFixed(1)} ms |`,
    `| output | ${heic.outputBytes} bytes, ${heic.width}x${heic.height} | ${jpeg.outputBytes} bytes, ${jpeg.width}x${jpeg.height} |`,
    `| encode | ${heic.encodeMs.toFixed(1)} ms | ${jpeg.encodeMs.toFixed(1)} ms |`,
    `| metadata removed | ${heic.metadataRemoved} | ${jpeg.metadataRemoved} |`,
    "",
    "## What the record says",
    "",
    `The platform decodes the JPEG in ${jpeg.decodeMs.toFixed(1)} ms and the HEIC takes ` +
      `${heic.decodeMs.toFixed(1)} ms plus nine megabytes of WebAssembly: that factor of ` +
      `${(heic.decodeMs / jpeg.decodeMs).toFixed(0)} is the price of a codec browsers do not ship.`,
    "",
    `AVIF encoding is ${record.formats["image/avif"] ? "available" : "not available"} in this build, ` +
      "which is why the plan refuses it instead of asking and hoping.",
    "",
    `The JPEG came out ${jpeg.width}x${jpeg.height}: the injected Orientation 6 was honoured by ` +
      "`createImageBitmap`, so the pipeline drew a portrait picture from a landscape file. The HEIC, " +
      "with no EXIF, stayed landscape.",
    "",
    "## What it does not say",
    "",
    "The two inputs are a 6 kB HEIC and an 8 kB JPEG of a synthetic frame, not two 4 MB photos from",
    "a phone. The ratios hold approximately; the milliseconds do not scale linearly, and the chapter",
    "says so where it prints them.",
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });

  const log = [];
  page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__pipeline === "function", { timeout: 30_000 });

  // The first run pays for nine megabytes of WebAssembly; the second is the pipeline.
  const cold = await page.evaluate(() => window.__pipeline());
  const output = await page.evaluate(() => window.__pipeline());
  await page.click("#run");
  await page.waitForFunction(
    () => (document.querySelector("#out")?.textContent ?? "").includes("->"),
    { timeout: 120_000 },
  );
  await page.screenshot({ path: join(DIR, "screenshot.png"), fullPage: true });
  mkdirSync(join(ROOT, "chapters", CHAPTER, "images"), { recursive: true });
  copyFileSync(
    join(DIR, "screenshot.png"),
    join(ROOT, "chapters", CHAPTER, "images", "run_image_pipeline.png"),
  );

  await browser.close();
  server.close();

  const [heic, jpeg] = output.results;
  if (!heic || !jpeg) throw new Error("the pipeline returned fewer than two photos");
  if (jpeg.metadataRemoved < 1) throw new Error("the strip removed nothing; nothing written");
  if (heic.outputBytes <= 0) throw new Error("the HEIC produced no output");

  const record = {
    id: ID,
    chapter: 6,
    workload: "cover.heic and cover.jpg, both to 320 wide WebP at quality 0.8",
    engine: "chrome",
    measuredAt: new Date().toISOString(),
    browser: `Chrome ${version}`,
    formats: output.formats,
    results: output.results,
    cold: cold.results,
    heicSegments: output.heicSegments,
    jpegSegments: output.jpegSegments,
    strippedSegments: output.strippedSegments,
    packages: {
      lockfile: "package-lock.json",
      sha256: existsSync(join(ROOT, "package-lock.json"))
        ? (await import("node:crypto"))
            .createHash("sha256")
            .update(readFileSync(join(ROOT, "package-lock.json")))
            .digest("hex")
        : null,
      libheif: JSON.parse(
        readFileSync(join(ROOT, "node_modules", "libheif-js", "package.json"), "utf8"),
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
  const row = `| ${[
    ID,
    "6",
    "chrome",
    "heic 6 kB + jpeg 8 kB",
    `decode ${heic.decodeMs.toFixed(0)} / ${jpeg.decodeMs.toFixed(0)} ms`,
    `${heic.outputBytes} bytes out`,
    record.measuredAt.slice(0, 10),
    `[${ID}](./${CHAPTER}/${ID}/record.json)`,
  ].join(" | ")} |`;
  const rows = existing.filter((line) => !line.startsWith(`| ${ID} |`));
  rows.push(line_join(rows, row));
  writeFileSync(indexPath, `${[...header, ...rows].join("\n")}\n`);

  console.log(`heic             ${heic.inputBytes} -> ${heic.outputBytes} bytes, decode ${heic.decodeMs.toFixed(1)} ms`);
  console.log(`jpeg             ${jpeg.inputBytes} -> ${jpeg.outputBytes} bytes, decode ${jpeg.decodeMs.toFixed(1)} ms`);
  console.log(`metadata         ${jpeg.metadataRemoved} segment(s) removed`);
  console.log(`avif             ${output.formats["image/avif"] ? "available" : "refused by the platform"}`);
  console.log(`record           runs/${CHAPTER}/${ID}/record.json`);

  return 0;
}

function line_join(rows, row) {
  rows.push(row);
  return rows.pop();
}

process.exit(
  await main().catch((error) => {
    console.error(error.message);
    return 1;
  }),
);
