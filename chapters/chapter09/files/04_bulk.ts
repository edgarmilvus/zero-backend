/**
 * Example 4 - ten thousand rows, with and without a transaction.
 *
 *   node chapters/chapter09/files/04_bulk.ts
 *
 * The same inserts, twice: once as ten thousand autocommitted statements, once inside one
 * transaction. The difference is the chapter's product claim — a database in the tab is fast when the
 * page uses it like a database.
 */

import { openStore, type DocStore, newDoc } from "./db.ts";

const COUNT = 10_000;

async function withoutTransaction(store: DocStore): Promise<number> {
  const started = performance.now();
  for (let index = 0; index < COUNT; index += 1) {
    const doc = newDoc(index);
    await store.query("insert into docs (title, body, tags) values ($1, $2, $3)", [
      doc.title,
      doc.body,
      `{${doc.tags.join(",")}}`,
    ]);
  }
  return performance.now() - started;
}

async function withTransaction(store: DocStore): Promise<number> {
  const started = performance.now();
  await store.query("begin");
  for (let index = 0; index < COUNT; index += 1) {
    const doc = newDoc(index);
    await store.query("insert into docs (title, body, tags) values ($1, $2, $3)", [
      doc.title,
      doc.body,
      `{${doc.tags.join(",")}}`,
    ]);
  }
  await store.query("commit");
  return performance.now() - started;
}

export async function main(): Promise<number> {
  const plain = await openStore();
  const asynchronous = await withoutTransaction(plain);
  await plain.query("delete from docs");
  const transactional = await withTransaction(plain);

  console.log(`autocommit        ${COUNT} rows in ${asynchronous.toFixed(0)} ms (${(asynchronous / COUNT).toFixed(2)} ms each)`);
  console.log(`one transaction   ${COUNT} rows in ${transactional.toFixed(0)} ms (${(transactional / COUNT).toFixed(2)} ms each)`);
  console.log("");
  console.log("");
  console.log(
    `the transaction is ${(asynchronous / transactional).toFixed(1)}x faster here, and the small gap is the lesson:`,
  );
  console.log("this database is in memory, so an autocommit has no fsync to pay for. On OPFS each one would.");
  console.log("The reason to use a transaction is not speed, it is the rollback: a failure at row 9,000");

  await plain.close();
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
