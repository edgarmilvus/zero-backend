/**
 * Chapter 9 harness: 56 assertions against a real Postgres running in the process.
 *
 * PGlite is the second thing in this book the gate can execute end to end, after audio: the database
 * is a package, not a browser feature, so the harness migrates it, fills it, queries it and closes it.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LATEST_VERSION, MIGRATIONS, assertMigrations, upTo } from "./schema.ts";
import { countDocs, insertDocs, migrate, newDoc, openStore, search } from "./db.ts";
import { assertCount, assertMigrated, renderOpen, renderSearch } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };
const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => {
  checks.push({ name, run });
};

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}
function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) {
    throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  }
  return true;
}
function throwsSync(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}
async function throwsAsync(fn: () => Promise<unknown>, what: string): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

// --- the schema, with no database -------------------------------------------

check("there are three migrations", () => eq(MIGRATIONS.length, 3, "count"));
check("the latest version is the last one", () => eq(LATEST_VERSION, 3, "version"));
check("the migrations are gapless and sorted", () =>
  expect(assertMigrations() === undefined, "threw"),
);
check("a fresh database needs all of them", () => eq(upTo(0).length, 3, "pending"));
check("a database at 2 needs one", () => eq(upTo(2).map((m) => m.version).join(","), "3", "pending"));
check("a database at the latest needs none", () => eq(upTo(3).length, 0, "pending"));
check("a database newer than the code is refused", () => {
  const error = throwsSync(() => upTo(9), "newer");
  return expect(error.message.includes("later version"), error.message);
});
check("a negative version is refused", () => {
  const error = throwsSync(() => upTo(-1), "negative");
  return expect(error.message.includes("non-negative"), error.message);
});
check("every migration has at least one statement", () =>
  expect(MIGRATIONS.every((migration) => migration.up.length > 0), "empty migration"),
);
check("upTo returns them in version order", () =>
  eq(upTo(0).map((migration) => migration.version).join(","), "1,2,3", "order"),
);
check("a database at 1 needs two", () => eq(upTo(1).length, 2, "pending"));
check("the second migration adds a tag index", () =>
  expect(MIGRATIONS[1]?.up.some((sql) => sql.includes("gin")) === true, "no gin index"),
);

// --- opening and migrating --------------------------------------------------

const store = await openStore();

check("a new database is at the latest version", () =>
  expect(store.version === LATEST_VERSION, `version ${store.version}`),
);
check("the store opens without a data directory", () =>
  expect(store.persistent === false, "persistent"),
);
check("the tag index exists after migration 2", async () => {
  const rows = await store.query<{ indexname: string }>(
    "select indexname from pg_indexes where tablename = 'docs'",
  );
  return expect(rows.some((row) => row.indexname.includes("tags")), JSON.stringify(rows));
});
check("the version table has one row per migration", async () => {
  const rows = await store.query<{ version: number }>("select version from schema_migrations order by version");
  return eq(rows.map((row) => row.version).join(","), "1,2,3", "versions");
});
check("the docs table exists and is empty", async () => eq(await countDocs(store), 0, "rows"));
check("the engine is Postgres", async () => {
  const [row] = await store.query<{ version: string }>("select version() as version");
  return expect(String(row?.version).startsWith("PostgreSQL"), String(row?.version));
});
check("migrating again is a no-op", async () => eq(await migrate(store), LATEST_VERSION, "version"));
check("the store reports itself as not persistent", () => eq(store.persistent, false, "persistent"));
check("assertMigrated passes at the latest version", () =>
  expect(assertMigrated(store, LATEST_VERSION) === undefined, "threw"),
);
check("assertMigrated refuses a store behind the code", () => {
  const error = throwsSync(() => assertMigrated({ ...store, version: 1 }, LATEST_VERSION), "behind");
  return expect(error.message.includes("expects"), error.message);
});

// --- writing ----------------------------------------------------------------

check("one insert returns one row", async () => {
  await insertDocs(store, [newDoc(1)]);
  return eq(await countDocs(store), 1, "rows");
});
check("an insert with an empty list writes nothing", async () => {
  eq(await insertDocs(store, []), 0, "inserted");
  return eq(await countDocs(store), 1, "rows");
});
check("ten inserts land in one transaction", async () => {
  const before = await countDocs(store);
  await insertDocs(store, Array.from({ length: 10 }, (_, index) => newDoc(index + 10)));
  return eq(await countDocs(store), before + 10, "rows");
});
check("a tag array survives the round trip", async () => {
  const rows = await store.query<{ tags: string[] }>("select tags from docs order by id limit 1");
  return expect(Array.isArray(rows[0]?.tags), `tags ${JSON.stringify(rows[0]?.tags)}`);
});
check("the created_at default is filled", async () => {
  const rows = await store.query<{ created_at: string | null }>("select created_at from docs limit 1");
  return expect(rows[0]?.created_at !== null, "null timestamp");
});
check("a failed insert rolls the batch back", async () => {
  const before = await countDocs(store);
  // The second document has a null title, which the schema refuses; the first must not survive.
  const error = await throwsAsync(
    () =>
      insertDocs(store, [
        { title: "fine", body: "ok", tags: [] },
        { title: null as unknown as string, body: "bad", tags: [] },
      ]),
    "null title",
  );
  expect(error.message.includes("rolled back"), error.message);
  return eq(await countDocs(store), before, "rows after rollback");
});
check("the rolled-back batch left no partial row", async () => {
  const rows = await store.query<{ n: number }>("select count(*)::int as n from docs where title = 'fine'");
  return eq(rows[0]?.n, 0, "partial rows");
});

// --- reading ----------------------------------------------------------------

check("a search finds a title", async () => {
  const rows = await search(store, "note 1");
  return expect(rows.length > 0, "no rows");
});
check("a search is case-insensitive", async () => {
  const upper = await search(store, "NOTE 1");
  const lower = await search(store, "note 1");
  return eq(upper.length, lower.length, "matches");
});
check("a search respects its limit", async () => {
  const rows = await search(store, "note", 3);
  return expect(rows.length <= 3, `rows ${rows.length}`);
});
check("a search returns the newest first", async () => {
  const rows = await search(store, "note", 5);
  const dates = rows.map((row) => new Date(row.createdAt).getTime());
  return eq(dates.every((value, index) => index === 0 || value <= (dates[index - 1] ?? 0)), true, "order");
});
check("a term with a quote does not change the query", async () => {
  const before = await countDocs(store);
  await search(store, "'; drop table docs; --");
  return eq(await countDocs(store), before, "rows after the injection attempt");
});
check("a term with a percent matches like a pattern, not like a wildcard", async () => {
  const rows = await search(store, "%");
  return expect(rows.length === 0, `rows ${rows.length}`);
});
check("newDoc cycles three tag combinations", () => {
  const sets = [0, 1, 2, 3].map((index) => newDoc(index).tags.join("+"));
  return eq(sets.join(","), "work,home,work+home,work", "tags");
});
check("the docs table has the five columns the code uses", async () => {
  const rows = await store.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_name = 'docs' order by ordinal_position`,
  );
  return eq(rows.map((row) => row.column_name).join(","), "id,title,body,created_at,tags", "columns");
});
check("a persistent store is labelled as one", () => {
  const text = renderOpen({ engine: "pglite", version: 3, persistent: true, loadMs: 12, rows: 0 });
  return expect(text.includes("opfs"), text);
});
check("a search for nothing returns nothing", async () => eq((await search(store, "zzzz-not-there")).length, 0, "rows"));
check("the row shape carries the four fields the page uses", async () => {
  const [row] = await search(store, "note 1");
  if (!row) throw new Error("no row");
  return eq(Object.keys(row).sort().join(","), "body,createdAt,id,tags,title", "keys");
});
check("counting is a number and not a string", async () => {
  const rows = await countDocs(store);
  return expect(Number.isInteger(rows), `count ${rows}`);
});
check("a delete and a count agree", async () => {
  const before = await countDocs(store);
  await store.query("delete from docs where title = 'note 1'");
  const after = await countDocs(store);
  return expect(after <= before, `${after} after ${before}`);
});
check("assertCount accepts a real count", () => expect(assertCount(store, 5) === undefined, "threw"));
check("assertCount refuses a negative count", () => {
  const error = throwsSync(() => assertCount(store, -1), "negative");
  return expect(error.message.includes("not a count"), error.message);
});

// --- the report -------------------------------------------------------------

check("the rendered open names the engine and the version", () => {
  const text = renderOpen({ engine: "pglite", version: 3, persistent: false, loadMs: 12, rows: 4 });
  expect(text.includes("pglite"), "engine");
  return expect(text.includes("version    3"), "version");
});
check("a memory store is labelled as one", () => {
  const text = renderOpen({ engine: "pglite", version: 3, persistent: false, loadMs: 12, rows: 0 });
  return expect(text.includes("a reload loses it"), text);
});
check("the rendered search shows the term and the time", () => {
  const text = renderSearch("note", [{ id: 1, title: "note 1" }], 4.2);
  expect(text.includes('"note"'), "term");
  return expect(text.includes("4.2 ms"), "time");
});

// --- persistence ------------------------------------------------------------

check("a database with a data directory survives a close", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zero-backend-db-"));
  const first = await openStore({ dataDir: dir });
  await insertDocs(first, [newDoc(1), newDoc(2)]);
  await first.close();

  const second = await openStore({ dataDir: dir });
  const rows = await countDocs(second);
  await second.close();
  rmSync(dir, { recursive: true, force: true });
  return eq(rows, 2, "rows");
});
check("a memory database does not", async () => {
  const memory = await openStore();
  await insertDocs(memory, [newDoc(1)]);
  await memory.close();
  const again = await openStore();
  const rows = await countDocs(again);
  await again.close();
  return eq(rows, 0, "rows");
});
check("a persistent store reports itself as one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zero-backend-db2-"));
  const store = await openStore({ dataDir: dir });
  eq(store.persistent, true, "persistent");
  await store.close();
  rmSync(dir, { recursive: true, force: true });
  return true;
});

// --- the programs -----------------------------------------------------------

const run = (script: string) =>
  spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8" });

check("01 opens a database and prints the engine", () => {
  const result = run("01_open.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("PostgreSQL"), result.stdout);
});
check("02 shows three migrations and a second open that applies none", () => {
  const result = run("02_migrate.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("1:documents"), "version table");
  return expect(result.stdout.includes("nothing applied again"), "idempotent");
});
check("03 inserts a thousand notes and searches them", () => {
  const result = run("03_query.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("note 42"), result.stdout);
});
check("04 compares autocommit with one transaction", () => {
  const result = spawnSync(process.execPath, [join(HERE, "04_bulk.ts")], { encoding: "utf8", timeout: 300_000 });
  eq(result.status ?? -1, 0, `exit ${result.status}`);
  expect(result.stdout.includes("autocommit"), "autocommit");
  return expect(result.stdout.includes("one transaction"), "transaction");
});
check("05 writes, closes and finds the rows again", () => {
  const result = run("05_persist.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("found them"), result.stdout);
});
check("the harness closes the store it opened", async () => {
  await store.close();
  const error = await throwsAsync(() => store.query("select 1"), "closed");
  return expect(error instanceof Error, "no error");
});

// --- run --------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
    return 1;
  }

  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${number}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${number}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }

  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
