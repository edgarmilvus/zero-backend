/**
 * Example 2 - the same job, both paths, five columns.
 *
 * The client column is not computed. It is read from a measurement record, and
 * if there is no record the program refuses and says how to make one. That
 * refusal is the chapter's rule in executable form: an estimate labelled as an
 * estimate is allowed, an estimate passed off as a measurement is not.
 *
 *   node chapters/chapter01/files/02_compare_paths.ts
 *   node chapters/chapter01/files/02_compare_paths.ts --record <path>/record.json
 *   node chapters/chapter01/files/02_compare_paths.ts --estimate
 */

import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import {
  compare,
  type ClientMeasurement,
  usd,
} from "./ledger.ts";
import { REEL, withMeasurement } from "./reel.ts";
import {
  assertFiveColumns,
  assertNoEmptyLossColumn,
  renderMarkdown,
} from "./report.ts";
import { TARIFF_2026_11 } from "./tariff.ts";

export const DEFAULT_RECORD = "runs/chapter01/reel-120mb/record.json";

type RecordFile = {
  readonly result?: { readonly wallClockMs?: number; readonly peakHeapBytes?: number };
};

function fromRecord(path: string): ClientMeasurement {
  if (!existsSync(path)) {
    throw new Error(
      `no record at ${path}\n` +
        `  make one: node chapters/chapter01/files/05_hash_the_file.ts --write\n` +
        `  or accept an estimate, labelled as one: --estimate`,
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as RecordFile;
  const wallClockMs = raw.result?.wallClockMs;
  const peakHeapBytes = raw.result?.peakHeapBytes;
  if (typeof wallClockMs !== "number" || typeof peakHeapBytes !== "number") {
    throw new Error(`${path}: result.wallClockMs and result.peakHeapBytes are required`);
  }
  return { wallClockMs, peakHeapBytes, source: "measured", record: path };
}

export function main(argv: readonly string[]): number {
  const recordFlag = argv.indexOf("--record");
  const path = recordFlag >= 0 ? (argv[recordFlag + 1] ?? DEFAULT_RECORD) : DEFAULT_RECORD;

  let measurement: ClientMeasurement;
  try {
    measurement =
      argv.includes("--estimate")
        ? { wallClockMs: 600, peakHeapBytes: 0, source: "estimate", record: null }
        : fromRecord(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const workload = withMeasurement(REEL, measurement);
  const pair = compare(workload, TARIFF_2026_11);
  const table = renderMarkdown(pair);

  assertFiveColumns(table);
  assertNoEmptyLossColumn(pair);

  console.log(table);
  console.log("");
  console.log(`server per job   ${usd(pair.server.perThousandUsd / 1000)}`);
  console.log(`client source    ${measurement.source}${measurement.record ? ` (${measurement.record})` : ""}`);
  console.log(
    `bytes avoided    ${pair.server.bytesLeavingDevice} bytes never leave the device`,
  );
  console.log("");
  console.log("server assumptions:");
  for (const line of pair.server.assumptions) console.log(`  - ${line}`);

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
