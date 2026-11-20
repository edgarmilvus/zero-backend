/**
 * The five columns, rendered once and asserted everywhere.
 *
 * The book publishes this table twenty times. If the renderer can produce a row
 * with four columns, or with an empty fifth, then a chapter can ship a claim with
 * a hole in it. So the shape is a function, and the shape is checked.
 */

import { duration, megabytes, usd, type CostRow } from "./ledger.ts";

export const COLUMNS = [
  "server cost per 1,000 operations",
  "client cost",
  "latency",
  "bytes leaving the device",
  "what you lose",
] as const;

export type Pair = { readonly server: CostRow; readonly client: CostRow };

function cells(pair: Pair): string[] {
  return [
    usd(pair.server.perThousandUsd),
    usd(pair.client.perThousandUsd),
    `${duration(pair.server.latencyMs)} -> ${duration(pair.client.latencyMs)}`,
    `${megabytes(pair.server.bytesLeavingDevice)} -> ${megabytes(
      pair.client.bytesLeavingDevice,
    )}`,
    pair.client.loses,
  ];
}

/** The table the book prints, exactly five columns wide. */
export function renderMarkdown(pair: Pair): string {
  const header = `| ${COLUMNS.join(" | ")} |`;
  const rule = `| ${COLUMNS.map(() => "---").join(" | ")} |`;
  const row = `| ${cells(pair).join(" | ")} |`;
  return [header, rule, row].join("\n");
}

/** The same row for a spreadsheet, which is where the reader will take it. */
export function renderCsv(pair: Pair): string {
  const escape = (value: string): string =>
    /[",]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return [COLUMNS.map(escape).join(","), cells(pair).map(escape).join(",")].join("\n");
}

/** Fails unless the header is the five columns, in order. */
export function assertFiveColumns(markdown: string): void {
  const [header] = markdown.split("\n");
  const expected = `| ${COLUMNS.join(" | ")} |`;
  if (header !== expected) {
    throw new Error(`table header is not the five columns:\n  got      ${header}\n  expected ${expected}`);
  }
  const body = markdown.split("\n")[2] ?? "";
  const count = body.split("|").length - 2;
  if (count !== COLUMNS.length) {
    throw new Error(`table row has ${count} columns, expected ${COLUMNS.length}`);
  }
}

/** The fifth column is never empty. A row that loses nothing has not been finished. */
export function assertNoEmptyLossColumn(pair: Pair): void {
  for (const row of [pair.server, pair.client]) {
    if (row.loses.trim().length === 0) {
      throw new Error(`${row.path} row: "what you lose" is empty`);
    }
  }
}
