/**
 * Generates the Parquet the browser page reads, so that the fixture is reproducible rather than
 * mysterious.
 *
 *   node chapters/chapter10/files/make_events.ts
 *
 * The output is two megabytes in `browser/events.parquet`, which is small enough to ship with the
 * chapter and large enough that scanning it is a real scan. Running this again overwrites it with the
 * same bytes: `range()` and the modular arithmetic have no seed.
 */

import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CREATE_EVENTS, COUNT_EVENTS } from "./queries.ts";
import { openDuck } from "./duck.ts";
import { humanBytes } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVENTS_PARQUET = join(HERE, "browser", "events.parquet");

export async function main(): Promise<number> {
  const { duck } = await openDuck();
  await duck.query(CREATE_EVENTS);
  await duck.query(`copy events to '${EVENTS_PARQUET}' (format parquet, compression zstd)`);

  const [row] = await duck.query<{ n: number }>(COUNT_EVENTS);
  const bytes = statSync(EVENTS_PARQUET).size;

  console.log(`rows              ${row?.n ?? 0}`);
  console.log(`file              ${EVENTS_PARQUET}`);
  console.log(`size              ${humanBytes(bytes)} (${bytes} bytes)`);
  console.log("");
  console.log("the page fetches this file, hands the bytes to the engine, and never parses a row");

  await duck.close();
  return row?.n === 1_000_000 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
