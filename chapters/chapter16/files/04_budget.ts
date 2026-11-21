/**
 * Example 4 - what fits, and what does not.
 *
 *   node chapters/chapter16/files/04_budget.ts
 *
 * The book's engines measured against the floppy and against the app's own build. The point is not
 * that the big ones are bad; it is that a budget makes the choice explicit.
 */

import { buildApp } from "./bundle.ts";
import { BUDGET_BYTES, FLOPPY_BYTES, fits, share } from "./budget.ts";

const ENGINES: readonly { name: string; bytes: number; chapter: number }[] = [
  { name: "PGlite", bytes: 26_369_652, chapter: 9 },
  { name: "DuckDB mvp", bytes: 41_325_187, chapter: 10 },
  { name: "MiniLM q8", bytes: 23_684_681, chapter: 11 },
  { name: "FFmpeg wasm", bytes: 32_000_000, chapter: 4 },
];

export function main(): number {
  const build = buildApp();
  console.log(`the app           ${build.bytes} bytes (${(share(build.bytes) * 100).toFixed(0)} per cent of the ${BUDGET_BYTES}-byte budget)`);
  console.log("");
  for (const engine of ENGINES) {
    console.log(
      `${engine.name.padEnd(12)} ${String(engine.bytes).padStart(11)} bytes  ` +
        `${fits(engine.bytes) ? "fits" : `${(engine.bytes / FLOPPY_BYTES).toFixed(1)} floppies`}  chapter ${engine.chapter}`,
    );
  }

  console.log("");
  console.log(`the app is ${(build.bytes / 1_000).toFixed(0)} kB: notes, search, share and export, no engine`);

  return fits(build.bytes) && !fits(ENGINES[0]!.bytes) ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
