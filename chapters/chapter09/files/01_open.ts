/**
 * Example 1 - what it costs to open a database in a tab.
 *
 *   node chapters/chapter09/files/01_open.ts
 *
 * PGlite opens instantly and answers the first query 1.6 seconds later, because that is when the 26 MB
 * of WebAssembly is instantiated. A page that shows a spinner without a number looks broken; a page
 * that says "starting the database" for two seconds looks like a page starting a database.
 */

import { openStore } from "./db.ts";
import { renderOpen } from "./report.ts";

export async function main(): Promise<number> {
  const started = performance.now();
  const store = await openStore();
  const loadMs = performance.now() - started;

  const [row] = await store.query<{ version: string }>("select version() as version");
  const rows = await store.query<{ n: number }>("select count(*)::int as n from docs");

  console.log(renderOpen({ engine: store.engine, version: store.version, persistent: false, loadMs, rows: rows[0]?.n ?? 0 }));
  console.log("");
  console.log(`server version    ${String(row?.version).split(" ").slice(0, 2).join(" ")}`);
  console.log("");
  console.log("the dataset is the user's: nothing here went over a network");

  await store.close();
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
