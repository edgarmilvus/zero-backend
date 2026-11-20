/**
 * Example 2 - a million rows, generated rather than shipped.
 *
 *   node chapters/chapter10/files/02_generate.ts
 *
 * `range(1000000)` plus two modular multiplications is a table with a thousand users, seven kinds
 * and two-decimal amounts, and it costs a fraction of a second. A fixture of the same table would be
 * twenty megabytes in the repository and a seed nobody can reproduce.
 */

import { CREATE_EVENTS, COUNT_EVENTS, ROW_COUNT } from "./queries.ts";
import { openDuck } from "./duck.ts";

export async function main(): Promise<number> {
  const { duck, coldMs } = await openDuck();

  const started = performance.now();
  await duck.query(CREATE_EVENTS);
  const createMs = performance.now() - started;

  const [row] = await duck.query<{ n: number }>(COUNT_EVENTS);
  const rows = row?.n ?? 0;

  console.log(`cold start        ${coldMs.toFixed(0)} ms`);
  console.log(`generated         ${rows} rows in ${createMs.toFixed(0)} ms`);
  console.log(`rate              ${(rows / createMs / 1000).toFixed(1)} million rows per second`);
  console.log("");
  console.log(`the table is ${ROW_COUNT} rows of five columns, and no byte of it was downloaded`);

  await duck.close();
  return rows === ROW_COUNT ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
