/**
 * Example 1 - what it costs to open a columnar engine in a process.
 *
 *   node chapters/chapter10/files/01_open.ts
 *
 * The cold start is not the constructor. DuckDB's wasm has to compile before the first answer, and
 * the first answer is the number a page should put behind a spinner: about seven hundred milliseconds
 * here, and the chapter's record measures it again in Chrome.
 */

import { bundleBytes, openDuck } from "./duck.ts";
import { renderOpen } from "./report.ts";

export async function main(): Promise<number> {
  const { duck, coldMs } = await openDuck();

  console.log(
    renderOpen({ engine: duck.engine, version: duck.version, wasmBytes: bundleBytes(), coldMs }),
  );
  console.log("");
  console.log(`feature flags     ${duck.features}`);
  console.log("the engine is the engine: same SQL, same planner, no server");

  await duck.close();
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
