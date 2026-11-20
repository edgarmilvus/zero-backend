/**
 * Example 2 - the migrations, and the second time they run.
 *
 *   node chapters/chapter09/files/02_migrate.ts
 *
 * Three migrations, one transaction, a version table that can be read by the next page load. Running
 * them again is a no-op, which is the property that makes a retry after a crash safe.
 */

import { MIGRATIONS, LATEST_VERSION, upTo, assertMigrations } from "./schema.ts";
import { openStore } from "./db.ts";

export async function main(): Promise<number> {
  assertMigrations();

  console.log(`migrations        ${MIGRATIONS.length}, latest ${LATEST_VERSION}`);
  for (const migration of MIGRATIONS) {
    console.log(`  ${String(migration.version).padStart(2)}  ${migration.name.padEnd(18)} ${migration.up.length} statement(s)`);
  }
  console.log("");

  console.log(`a fresh database needs ${upTo(0).length} migrations`);
  console.log(`one at version 2 needs ${upTo(2).length}`);
  console.log(`one at the latest needs ${upTo(LATEST_VERSION).length}`);
  console.log("");

  const store = await openStore();
  const applied = await store.query<{ version: number; name: string }>(
    "select version, name from schema_migrations order by version",
  );
  console.log(`version table     ${applied.map((row) => `${row.version}:${row.name}`).join(" ")}`);
  console.log(`store version     ${store.version}`);
  console.log("");

  const again = await openStore();
  console.log(`a second open     version ${again.version}, nothing applied again`);

  await store.close();
  await again.close();
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
