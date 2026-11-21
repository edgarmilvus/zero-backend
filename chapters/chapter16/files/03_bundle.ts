/**
 * Example 3 - the build.
 *
 *   node chapters/chapter16/files/03_bundle.ts
 *
 * Three modules, stripped and concatenated, wrapped in one HTML file written to `built/app.html`. The
 * check that no import survived is the build's correctness test.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildApp } from "./bundle.ts";
import { assertFits, renderBudget } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export function main(): number {
  const build = buildApp();
  mkdirSync(join(HERE, "built"), { recursive: true });
  const path = join(HERE, "built", "app.html");
  writeFileSync(path, build.html);

  console.log(renderBudget(build.bytes, build.parts));
  console.log("");
  console.log(`written           ${path}`);

  assertFits(build.bytes);
  const noImports = !/^\s*import\s+[{*\w]/m.test(build.html) && !/\brequire\(/.test(build.html);
  console.log(`no imports        ${noImports}`);
  console.log("one file, no runtime, no fetch: the floppy is the deployment");

  return noImports ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
