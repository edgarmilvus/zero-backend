/**
 * Example 4 - the file format is the product.
 *
 *   node chapters/chapter10/files/04_parquet.ts
 *
 * The same million rows written twice: as CSV, which every tool reads and every page parses, and as
 * Parquet, which needs a schema and returns one. The interesting number is not the write time — CSV
 * wins it — but the size, and what a query costs when it reads the file directly.
 */

import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CREATE_EVENTS, expectedSums, ROW_COUNT } from "./queries.ts";
import { openDuck } from "./duck.ts";
import { assertParquetSmaller, assertSum, renderParquet, type KindRow } from "./report.ts";

export async function main(): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "zero-backend-duck-"));
  const parquet = join(dir, "events.parquet");
  const csv = join(dir, "events.csv");

  const { duck } = await openDuck();
  await duck.query(CREATE_EVENTS);

  let started = performance.now();
  await duck.query(`copy events to '${parquet}' (format parquet, compression zstd)`);
  const writeMs = performance.now() - started;

  started = performance.now();
  await duck.query(`copy events to '${csv}' (format csv, header)`);
  const csvWriteMs = performance.now() - started;

  started = performance.now();
  const [count] = await duck.query<{ n: number }>(`select count(*)::bigint as n from '${parquet}'`);
  const countMs = performance.now() - started;

  started = performance.now();
  const rows = await duck.query<KindRow>(
    `select kind, count(*)::bigint as n, sum(amount) as total, avg(amount) as mean
       from '${parquet}' group by kind order by kind`,
  );
  const scanMs = performance.now() - started;

  const parquetBytes = statSync(parquet).size;
  const csvBytes = statSync(csv).size;

  console.log(
    renderParquet({
      rows: count?.n ?? 0,
      parquetBytes,
      csvBytes,
      writeMs,
      csvWriteMs,
      scanMs,
      countMs,
    }),
  );

  assertParquetSmaller(parquetBytes, csvBytes);
  assertSum(rows, expectedSums());

  console.log("");
  console.log(`the query read ${parquetBytes} bytes instead of ${csvBytes}, and returned the same sums`);

  await duck.close();
  rmSync(dir, { recursive: true, force: true });
  return count?.n === ROW_COUNT ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
