/**
 * What the chapter prints, and the two assertions that make a printed number a claim.
 */

export type KindRow = { readonly kind: number; readonly n: number; readonly total: number; readonly mean: number };
export type UserRow = { readonly user_id: number; readonly n: number };

export type OpenReport = {
  readonly engine: string;
  readonly version: string;
  readonly wasmBytes: number;
  readonly coldMs: number;
};

export type ParquetReport = {
  readonly rows: number;
  readonly parquetBytes: number;
  readonly csvBytes: number;
  readonly writeMs: number;
  readonly csvWriteMs: number;
  readonly scanMs: number;
  readonly countMs: number;
};

export function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${bytes} B`;
}

export function renderOpen(open: OpenReport): string {
  return [
    `engine            ${open.engine}`,
    `duckdb            ${open.version}`,
    `wasm on disk      ${humanBytes(open.wasmBytes)}`,
    `cold start        ${open.coldMs.toFixed(0)} ms to the first answer`,
  ].join("\n");
}

export function renderAggregate(rows: readonly KindRow[], wallClockMs: number): string {
  const lines = [`group by          ${rows.length} kinds in ${wallClockMs.toFixed(0)} ms`];
  for (const row of rows) {
    lines.push(
      `  ${String(row.kind).padStart(2)}  ${String(row.n).padStart(7)} rows  ` +
        `${row.total.toFixed(2).padStart(14)}  mean ${row.mean.toFixed(2)}`,
    );
  }
  return lines.join("\n");
}

export function renderParquet(report: ParquetReport): string {
  const ratio = report.csvBytes / report.parquetBytes;
  return [
    `rows              ${report.rows}`,
    `parquet           ${humanBytes(report.parquetBytes)} in ${report.writeMs.toFixed(0)} ms to write`,
    `csv               ${humanBytes(report.csvBytes)} in ${report.csvWriteMs.toFixed(0)} ms to write`,
    `parquet is        ${ratio.toFixed(1)}x smaller than the csv`,
    `count from file   ${report.countMs.toFixed(0)} ms`,
    `aggregate         ${report.scanMs.toFixed(0)} ms, scanning the parquet directly`,
  ].join("\n");
}

export function renderCompare(report: { rows: number; buildMs: number; groupMs: number; rssMb: number }): string {
  return [
    `rows              ${report.rows} JavaScript objects`,
    `build             ${report.buildMs.toFixed(0)} ms`,
    `group by          ${report.groupMs.toFixed(0)} ms`,
    `rss               ${report.rssMb} MB while the array is alive`,
  ].join("\n");
}

/**
 * The engine's answer against the arithmetic in `queries.ts`.
 *
 * The tolerance is a cent across a million additions: a float sum is allowed to differ in the last
 * place and is not allowed to differ in the total.
 */
export function assertSum(rows: readonly { kind: number; total: number }[], expected: readonly number[]): void {
  if (rows.length !== expected.length) {
    throw new Error(`aggregate returned ${rows.length} kinds, the arithmetic expects ${expected.length}`);
  }
  for (const [index, row] of rows.entries()) {
    const want = expected[index] ?? Number.NaN;
    if (Math.abs(row.total - want) > 0.01) {
      throw new Error(`kind ${row.kind}: total ${row.total}, expected ${want}`);
    }
  }
}

/** A "compressed" format that is larger than the CSV is a format the chapter would not recommend. */
export function assertParquetSmaller(parquetBytes: number, csvBytes: number): void {
  if (parquetBytes <= 0 || csvBytes <= 0) {
    throw new Error(`sizes must be positive: parquet ${parquetBytes}, csv ${csvBytes}`);
  }
  if (parquetBytes >= csvBytes) {
    throw new Error(`parquet is ${parquetBytes} bytes and the csv ${csvBytes}: the columnar file lost`);
  }
}
