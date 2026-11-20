/**
 * Example 5 - the database that survives its page.
 *
 *   node chapters/chapter09/files/05_persist.ts
 *
 * A database with a `dataDir` writes its files somewhere that outlives the process; one without it is
 * a heap and a promise. The program writes, closes, reopens and counts, which is the same test a page
 * performs with a reload.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { countDocs, insertDocs, newDoc, openStore } from "./db.ts";

export async function main(): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "zero-backend-db-"));

  const first = await openStore({ dataDir: dir });
  await insertDocs(first, [newDoc(1), newDoc(2), newDoc(3)]);
  console.log(`first open        ${await countDocs(first)} rows, persistent ${first.persistent}`);
  await first.close();

  const second = await openStore({ dataDir: dir });
  const rows = await countDocs(second);
  console.log(`second open       ${rows} rows, version ${second.version}`);
  await second.close();

  const memory = await openStore();
  console.log(`memory database   ${await countDocs(memory)} rows, and a reload would show the same`);
  await memory.close();

  rmSync(dir, { recursive: true, force: true });

  console.log("");
  console.log(rows === 3 ? "the rows were on disk, and the second open found them" : "the rows were lost, which is the bug");
  return rows === 3 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
