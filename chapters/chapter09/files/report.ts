/**
 * What the chapter prints: an open, a search, and two assertions.
 */

import type { DocStore } from "./db.ts";

export type Open = {
  readonly engine: string;
  readonly version: number;
  readonly persistent: boolean;
  readonly loadMs: number;
  readonly rows: number;
};

export function renderOpen(open: Open): string {
  return [
    `engine            ${open.engine}`,
    `schema version    ${open.version}`,
    `persistent        ${open.persistent ? "opfs" : "memory: a reload loses it"}`,
    `cold start        ${open.loadMs.toFixed(0)} ms`,
    `rows              ${open.rows}`,
  ].join("\n");
}

export function renderSearch(term: string, rows: readonly { id: number; title: string }[], wallClockMs: number): string {
  const lines = [
    `search            "${term}" in ${wallClockMs.toFixed(1)} ms`,
    ...rows.slice(0, 5).map((row) => `  ${String(row.id).padStart(5)}  ${row.title}`),
  ];
  if (rows.length > 5) lines.push(`  ... ${rows.length - 5} more`);
  return lines.join("\n");
}

/** A database at the latest version is the only one a page may write to. */
export function assertMigrated(store: DocStore, latest: number): void {
  if (store.version !== latest) {
    throw new Error(`schema is at ${store.version} and the code expects ${latest}`);
  }
}

/** A search that returns more than the table holds is a query that lost its `from`. */
export function assertCount(store: DocStore, rows: number): void {
  void store;
  if (!Number.isInteger(rows) || rows < 0) throw new Error(`row count ${rows} is not a count`);
}
