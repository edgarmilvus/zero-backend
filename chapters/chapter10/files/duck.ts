/**
 * The node binding: DuckDB's blocking build, which is a different entry point from the page's.
 *
 * The engine is the same WebAssembly. What changes is the glue: node gets a synchronous module that
 * the process instantiates directly, and a page gets a worker. That is why this file exists and why
 * `browser/duck-client.ts` exists, and why `queries.ts` — the SQL — is imported by both.
 */

import { createRequire } from "node:module";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "..", "..", "node_modules", "@duckdb", "duckdb-wasm", "dist");

/** An Arrow table, as much of it as this chapter uses. */
type ArrowTable = { toArray(): Array<{ toJSON(): Record<string, unknown> }> };

type Connection = {
  query(sql: string): Promise<ArrowTable>;
  close(): Promise<void>;
};

type Bindings = {
  instantiate(): Promise<unknown>;
  open(config: { path: string }): void;
  connect(): Connection;
  getVersion(): string;
  getFeatureFlags(): number;
  close?(): void;
};

/**
 * The module is CommonJS and its deep path has no type declaration, so the shape above is the
 * contract this file holds it to. A wrong assumption fails at the first query, not at import.
 */
const require = createRequire(import.meta.url);
const duckdb = require(join(DIST, "duckdb-node-blocking.cjs")) as {
  createDuckDB(bundles: unknown, logger: unknown, runtime: unknown): Promise<Bindings>;
  VoidLogger: new () => unknown;
  NODE_RUNTIME: unknown;
};

export type Duck = {
  readonly version: string;
  readonly features: number;
  readonly engine: "duckdb-node";
  query<T>(sql: string): Promise<T[]>;
  close(): Promise<void>;
};

export type OpenDuck = {
  readonly duck: Duck;
  /** Milliseconds from the call to the first answer: 26 MB of wasm and a first query. */
  readonly coldMs: number;
};

/** The wasm the node build loads, in bytes, so the chapter can quote a number instead of "huge". */
export function bundleBytes(): number {
  return statSync(join(DIST, "duckdb-mvp.wasm")).size + statSync(join(DIST, "duckdb-eh.wasm")).size;
}

/**
 * Opens an in-memory database.
 *
 * `instantiate` is the expensive call and `open` is not: the first compiles the wasm, the second
 * creates a catalog. The chapter times both because a page pays the first and a query pays neither.
 */
export async function openDuck(): Promise<OpenDuck> {
  const started = performance.now();

  const bindings = await duckdb.createDuckDB(
    {
      mvp: { mainModule: join(DIST, "duckdb-mvp.wasm"), mainWorker: join(DIST, "duckdb-node-mvp.worker.cjs") },
      eh: { mainModule: join(DIST, "duckdb-eh.wasm"), mainWorker: join(DIST, "duckdb-node-eh.worker.cjs") },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );

  await bindings.instantiate();
  bindings.open({ path: ":memory:" });
  const connection = bindings.connect();

  const duck: Duck = {
    version: bindings.getVersion(),
    features: bindings.getFeatureFlags(),
    engine: "duckdb-node",
    async query<T>(sql: string): Promise<T[]> {
      const table = await connection.query(sql);
      return table.toArray().map((row) => normalize(row.toJSON()) as T);
    },
    async close() {
      await connection.close();
      bindings.close?.();
    },
  };

  // The cold start is not the constructor: it is the first answer. Forcing one here keeps every
  // caller's stopwatch honest, which is the mistake chapter 4's copy made once.
  await duck.query("select 1 as one");

  return { duck, coldMs: performance.now() - started };
}

/**
 * BigInt is what DuckDB returns for `count(*)`, and it is what `JSON.stringify` refuses.
 *
 * Converting at the boundary rather than at every call site is the chapter's answer: a row that
 * leaves this file is JSON-safe, and the one place that knows about `bigint` is here.
 */
function normalize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") {
      out[key] = value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Runs one statement and returns its rows; the shape every example and the harness use. */
export async function runQuery<T>(duck: Duck, sql: string): Promise<T[]> {
  return duck.query<T>(sql);
}
