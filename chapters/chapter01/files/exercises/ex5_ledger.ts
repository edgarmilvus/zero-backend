/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * The shortest of the three, on purpose. It decides three things and delegates
 * everything else: which record to read, which workload to attach it to, and
 * what to print. Any rule that appears here belongs in core or in the schema.
 *
 *   node chapters/chapter01/files/exercises/ex5_ledger.ts <record.json>
 */

import { TARIFF_2026_11 } from "../tariff.ts";
import { compare, usd } from "../ledger.ts";
import { REEL, withMeasurement } from "../reel.ts";
import { assertFiveColumns, renderMarkdown } from "../report.ts";
import { addPath, newLedger, rowFor, total } from "./ledger_core.ts";
import { normalize, readRecord } from "./ledger_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_ledger.ts <record.json>");
    return 2;
  }

  let record;
  try {
    record = readRecord(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const workload = withMeasurement(REEL, {
    wallClockMs: numbers.wallClockMs,
    peakHeapBytes: numbers.peakHeapBytes,
    source: "measured",
    record: path,
  });

  const pair = compare(workload, TARIFF_2026_11);
  const ledger = addPath(addPath(newLedger(), pair.server), pair.client);
  const table = renderMarkdown(pair);
  assertFiveColumns(table);

  console.log(table);
  console.log("");
  console.log(`record           ${record.id} (chapter ${record.chapter}, ${record.engine})`);
  console.log(`input            ${record.input.name}, ${numbers.bytes} bytes`);
  console.log(`server row       ${usd(rowFor(ledger, "server").perThousandUsd)} per 1,000`);
  console.log(`client row       ${usd(rowFor(ledger, "client").perThousandUsd)} per 1,000`);
  console.log(`both rows added  ${usd(total(ledger))} (a spreadsheet would print this)`);

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
