/**
 * Example 4 - what has to be on disk.
 *
 *   node chapters/chapter12/files/04_manifest.ts
 *
 * The manifest is committed; the weights are not. The program validates the three required files and
 * prints the bytes, which is also the number a page has to fetch before it can embed anything.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertSameModel, validateManifest } from "./manifest.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export function main(): number {
  const manifest = validateManifest(JSON.parse(readFileSync(join(HERE, "model.json"), "utf8")));

  console.log(`model             ${manifest.model} (${manifest.dtype})`);
  console.log(`dimensions        ${manifest.dims}`);
  console.log(`files             ${manifest.files.length}, ${(manifest.totalBytes / 1024 / 1024).toFixed(1)} MB`);
  for (const file of manifest.files) {
    console.log(`  ${file.path.padEnd(28)} ${(file.bytes / 1024).toFixed(0)} kB`);
  }

  assertSameModel(manifest, manifest.model, manifest.dims);
  console.log("");
  console.log("the weights are fetched, not committed; the manifest is what a page can check");

  return manifest.dims === 384 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
