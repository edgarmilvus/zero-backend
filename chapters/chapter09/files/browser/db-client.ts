/**
 * The page: a Postgres in the tab, with the same store the node half uses.
 *
 * `db.ts` is imported unchanged. The only difference is the data directory: `idb://name` is PGlite's
 * browser persistence, which keeps the rows in IndexedDB so that a reload finds them again.
 */

import { countDocs, insertDocs, newDoc, openStore, search } from "../db.ts";
import { LATEST_VERSION } from "../schema.ts";
import { assertMigrated, renderSearch } from "../report.ts";

export type PageDb = {
  readonly version: number;
  readonly loadMs: number;
  readonly rows: number;
  readonly searchMs: number;
  readonly matches: number;
  readonly results: readonly { readonly id: number; readonly title: string }[];
  readonly persistent: boolean;
  readonly server: string;
};

const DATA_DIR = "idb://zero-backend";

export async function runDb(): Promise<PageDb> {
  const started = performance.now();
  const store = await openStore({ dataDir: DATA_DIR });
  const loadMs = performance.now() - started;

  assertMigrated(store, LATEST_VERSION);

  const before = await countDocs(store);
  if (before === 0) {
    await insertDocs(store, Array.from({ length: 1000 }, (_, index) => newDoc(index)));
  }

  const queryStarted = performance.now();
  const rows = await search(store, "note 42");
  const searchMs = performance.now() - queryStarted;

  const [version] = await store.query<{ version: string }>("select version() as version");
  const total = await countDocs(store);
  await store.close();

  return {
    version: store.version,
    loadMs,
    rows: total,
    searchMs,
    matches: rows.length,
    results: rows.slice(0, 5).map((row) => ({ id: row.id, title: row.title })),
    persistent: store.persistent,
    server: String(version?.version ?? "").split(" ").slice(0, 2).join(" "),
  };
}

declare global {
  interface Window {
    __db: () => Promise<PageDb>;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const button = document.querySelector<HTMLButtonElement>("#run");

  const render = (result: PageDb): string =>
    [
      `server           ${result.server}`,
      `schema version   ${result.version}`,
      `persistent       ${result.persistent ? "idb://" : "memory"}`,
      `cold start       ${result.loadMs.toFixed(0)} ms`,
      `rows             ${result.rows}`,
      renderSearch("note 42", result.results, result.searchMs),
    ].join("\n");

  const run = async (): Promise<void> => {
    if (status) status.textContent = "opening 26 MB of WebAssembly...";
    try {
      const result = await runDb();
      if (status) status.textContent = `${result.rows} rows, ${result.loadMs.toFixed(0)} ms to open`;
      if (output) output.textContent = render(result);
    } catch (error) {
      if (status) status.textContent = `failed: ${(error as Error).message}`;
    }
  };

  window.__db = runDb;
  button?.addEventListener("click", () => void run());
}
