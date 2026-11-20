/**
 * The store: open a PGlite, migrate it, and the four operations the product needs.
 *
 * PGlite is Postgres compiled to WebAssembly. It runs in node and in a page from the same package,
 * which is why this chapter's gate can open a real database — and why the numbers in the book are
 * measured rather than described.
 */

import { PGlite } from "@electric-sql/pglite";

import { LATEST_VERSION, assertMigrations, upTo } from "./schema.ts";

export type Doc = {
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
};

export type DocRow = Doc & { readonly id: number; readonly createdAt: string };

export type DocStore = {
  readonly engine: string;
  /** Filled once the migrations have run; the store is not usable before that. */
  version: number;
  readonly persistent: boolean;
  query<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  close(): Promise<void>;
};

/**
 * Opens a database, in memory or in OPFS.
 *
 * `dataDir` is what makes the difference: absent, the database lives in the wasm heap and a reload
 * loses it; with `id: "opfs"`, PGlite writes to the origin private file system through a worker, which
 * is the only one of the two that survives a document.
 */
export async function openStore(options: { readonly dataDir?: string } = {}): Promise<DocStore> {
  const db = options.dataDir
    ? await PGlite.create({ dataDir: options.dataDir })
    : await PGlite.create();

  const store: DocStore = {
    engine: "pglite",
    version: 0,
    persistent: Boolean(options.dataDir),
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const result = await db.query<T>(sql, params as unknown[]);
      return result.rows;
    },
    async close() {
      await db.close();
    },
  };

  store.version = await migrate(store);
  return store;
}

/**
 * Applies every migration the database still needs, in one transaction.
 *
 * One transaction for the whole run, not one per migration: a failure at step 3 leaves the database
 * at the version it started at, which is the property that makes a retry safe. The version table is
 * written inside the same transaction, so it cannot disagree with the schema.
 */
export async function migrate(store: DocStore): Promise<number> {
  assertMigrations();

  await store.query(`create table if not exists schema_migrations (
    version integer primary key,
    name text not null,
    applied_at timestamptz not null default now()
  )`);

  const [current] = await store.query<{ version: number | null }>(
    "select max(version) as version from schema_migrations",
  );
  const from = current?.version ?? 0;
  const pending = upTo(from);

  if (pending.length === 0) return from;

  await store.query("begin");
  try {
    for (const migration of pending) {
      for (const statement of migration.up) await store.query(statement);
      await store.query("insert into schema_migrations (version, name) values ($1, $2)", [
        migration.version,
        migration.name,
      ]);
    }
    await store.query("commit");
  } catch (error) {
    await store.query("rollback");
    throw new Error(`migration from ${from} failed and was rolled back: ${(error as Error).message}`);
  }

  return LATEST_VERSION;
}

/** Ten thousand rows, in one transaction, which is the difference between a second and a minute. */
export async function insertDocs(store: DocStore, docs: readonly Doc[]): Promise<number> {
  if (docs.length === 0) return 0;

  await store.query("begin");
  try {
    for (const doc of docs) {
      await store.query("insert into docs (title, body, tags) values ($1, $2, $3)", [
        doc.title,
        doc.body,
        `{${doc.tags.join(",")}}`,
      ]);
    }
    await store.query("commit");
  } catch (error) {
    await store.query("rollback");
    throw new Error(`insert failed and was rolled back: ${(error as Error).message}`);
  }

  return docs.length;
}

/**
 * The term, escaped for a LIKE pattern.
 *
 * A search box that interpolates the user's text into `ilike '%...%'` is a search box where `%` means
 * "everything" and `_` means "any character". The escaping is three replacements and an `escape`
 * clause, and without it a user who types a percent gets the whole table.
 */
function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export async function search(store: DocStore, term: string, limit = 20): Promise<DocRow[]> {
  const rows = await store.query<{
    id: number;
    title: string;
    body: string;
    tags: string[];
    created_at: string;
  }>(
    `select id, title, body, tags, created_at
       from docs
      where title ilike $1 escape '\\' or body ilike $1 escape '\\'
      order by created_at desc
      limit $2`,
    [likeTerm(term), limit],
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    tags: row.tags,
    createdAt: row.created_at,
  }));
}

export async function countDocs(store: DocStore): Promise<number> {
  const [row] = await store.query<{ n: number }>("select count(*)::int as n from docs");
  return row?.n ?? 0;
}

/** A document with enough text that an index has something to do. */
export function newDoc(index: number): Doc {
  return {
    title: `note ${index}`,
    body: `body of note ${index}: ${"lorem ipsum ".repeat(12)}`,
    tags: index % 3 === 0 ? ["work"] : index % 3 === 1 ? ["home"] : ["work", "home"],
  };
}
