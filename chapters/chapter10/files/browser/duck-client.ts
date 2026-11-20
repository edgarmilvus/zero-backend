/**
 * The page's binding: DuckDB's async build, a worker, and the same SQL as the node half.
 *
 * `duck.ts` cannot be imported here — it is `node:module` and a synchronous wasm module — and that is
 * the chapter's honest finding: the SQL is portable and the binding is not. `queries.ts` and
 * `report.ts` are imported unchanged; only the twenty lines that instantiate the engine differ.
 */

import * as duckdb from "@duckdb/duckdb-wasm";

import { aggregateFrom, countFrom, expectedSums, KINDS, ROW_COUNT } from "../queries.ts";
import { assertSum } from "../report.ts";

const VENDOR = "/vendor/@duckdb/duckdb-wasm/dist";

/**
 * The bundles, by hand rather than from a CDN.
 *
 * `getJsDelivrBundles()` is what the README does, and it is a page that cannot run offline and does
 * not use the version in `package-lock.json`. Naming the two files makes the page work on a train and
 * makes an upgrade a lockfile change.
 */
const BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: `${VENDOR}/duckdb-mvp.wasm`,
    mainWorker: `${VENDOR}/duckdb-browser-mvp.worker.js`,
  },
  eh: {
    mainModule: `${VENDOR}/duckdb-eh.wasm`,
    mainWorker: `${VENDOR}/duckdb-browser-eh.worker.js`,
  },
};

export type PageRun = {
  readonly bundle: string;
  readonly wasmBytes: number;
  readonly coldMs: number;
  readonly fetchMs: number;
  readonly countMs: number;
  /** The first aggregate: it pays for decompression and for the page cache. */
  readonly scanMs: number;
  /** The same aggregate again, which is what the page shows a user who runs it twice. */
  readonly warmMs: number;
  readonly rows: number;
  readonly sum: number;
  readonly kinds: readonly { kind: number; n: number; total: number }[];
};

export async function runPage(): Promise<PageRun> {
  const started = performance.now();

  const bundle = await duckdb.selectBundle(BUNDLES);
  if (!bundle.mainWorker) throw new Error("no worker in the selected bundle");

  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker ?? null);

  const connection = await db.connect();
  // The cold start ends at the first answer, not at the constructor: same rule as the node half.
  await connection.query("select 1 as one");
  const coldMs = performance.now() - started;

  const fetchedAt = performance.now();
  const response = await fetch("/browser/events.parquet");
  if (!response.ok) throw new Error(`events.parquet: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await db.registerFileBuffer("events.parquet", bytes);
  const fetchMs = performance.now() - fetchedAt;

  let queryStarted = performance.now();
  const table = await connection.query(countFrom("'events.parquet'"));
  const count = Number(table.toArray()[0]?.toJSON().n ?? 0);
  const countMs = performance.now() - queryStarted;

  queryStarted = performance.now();
  const aggregated = await connection.query(aggregateFrom("'events.parquet'"));
  const scanMs = performance.now() - queryStarted;

  queryStarted = performance.now();
  const again = await connection.query(aggregateFrom("'events.parquet'"));
  const warmMs = performance.now() - queryStarted;

  const kinds = again.toArray().map((row) => {
    const json = row.toJSON() as { kind: number; n: bigint; total: number };
    return { kind: Number(json.kind), n: Number(json.n), total: Number(json.total) };
  });

  assertSum(kinds, expectedSums());

  const wasm = await fetch(bundle.mainModule, { method: "HEAD" });
  const wasmBytes = Number(wasm.headers.get("content-length") ?? 0);

  await connection.close();
  await db.terminate();

  return {
    bundle: bundle.mainModule.includes("-eh.") ? "eh" : "mvp",
    wasmBytes,
    coldMs,
    fetchMs,
    countMs,
    scanMs,
    warmMs,
    rows: count,
    sum: kinds.reduce((sum, row) => sum + row.total, 0),
    kinds,
  };
}

declare global {
  interface Window {
    __analytics: () => Promise<PageRun>;
    /** The result of the run the button started, so a screenshot and its numbers are one run. */
    __lastRun?: PageRun;
  }
}

function render(result: PageRun): string {
  const lines = [
    `bundle           ${result.bundle}, ${(result.wasmBytes / 1024 / 1024).toFixed(1)} MB of wasm`,
    `cold start       ${result.coldMs.toFixed(0)} ms to the first answer`,
    `fetch            ${result.fetchMs.toFixed(0)} ms for events.parquet`,
    `rows             ${result.rows} (metadata only: ${result.countMs.toFixed(0)} ms)`,
    `aggregate        ${result.scanMs.toFixed(0)} ms cold, ${result.warmMs.toFixed(0)} ms warm`,
    "",
    "kind       rows            total",
  ];
  for (const row of result.kinds) {
    lines.push(
      `${String(row.kind).padStart(4)} ${String(row.n).padStart(10)} ${row.total.toFixed(2).padStart(16)}  ${KINDS[row.kind] ?? ""}`,
    );
  }
  lines.push("");
  lines.push(`sum              ${result.sum.toFixed(2)}`);
  return lines.join("\n");
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const button = document.querySelector<HTMLButtonElement>("#run");

  const run = async (): Promise<void> => {
    if (button) {
      button.disabled = true;
      button.textContent = "Starting the engine...";
    }
    if (status) status.textContent = "loading 35 MB of WebAssembly, then 2.3 MB of Parquet...";
    try {
      const result = await runPage();
      window.__lastRun = result;
      if (status) {
        status.textContent = `${result.rows} rows in ${result.warmMs.toFixed(0)} ms, ${result.bundle} bundle`;
      }
      if (output) output.textContent = render(result);
    } catch (error) {
      if (status) status.textContent = `failed: ${(error as Error).message}`;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Fetch 2.3 MB and scan 1,000,000 rows";
      }
    }
  };

  window.__analytics = runPage;
  button?.addEventListener("click", () => void run());
}
