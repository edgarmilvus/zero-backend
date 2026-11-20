/**
 * Example 3 - SQL over the user's own data.
 *
 *   node chapters/chapter09/files/03_query.ts
 *
 * A thousand notes, a search, and the two numbers that matter: how long the insert took and how long
 * the query took. The query is fast because Postgres is Postgres, even when it is running in a tab.
 */

import { countDocs, insertDocs, newDoc, openStore, search } from "./db.ts";
import { renderSearch } from "./report.ts";

const COUNT = 1000;

export async function main(): Promise<number> {
  const store = await openStore();

  const docs = Array.from({ length: COUNT }, (_, index) => newDoc(index));
  const insertStarted = performance.now();
  await insertDocs(store, docs);
  const insertMs = performance.now() - insertStarted;

  const queryStarted = performance.now();
  const rows = await search(store, "note 42");
  const queryMs = performance.now() - queryStarted;

  console.log(`inserted          ${await countDocs(store)} notes in ${insertMs.toFixed(0)} ms`);
  console.log(renderSearch("note 42", rows, queryMs));
  console.log("");
  console.log(`per insert        ${(insertMs / COUNT).toFixed(2)} ms, inside one transaction`);

  await store.close();
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
