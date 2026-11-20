/**
 * Example 3 - read a record, field by field.
 *
 * A number in the book is only as good as the file behind it. This walks the
 * file and prints where each part came from, so a reader who doubts the client
 * column can see the machine, the input digest and the engine before the result.
 *
 *   node chapters/chapter01/files/03_read_the_record.ts
 *   node chapters/chapter01/files/03_read_the_record.ts --record <path>/record.json
 */

import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_RECORD } from "./02_compare_paths.ts";
import { megabytes } from "./ledger.ts";

export function main(argv: readonly string[]): number {
  const flag = argv.indexOf("--record");
  const path = flag >= 0 ? (argv[flag + 1] ?? DEFAULT_RECORD) : DEFAULT_RECORD;

  if (!existsSync(path)) {
    console.error(`no record at ${path}`);
    console.error(`  the ledger cannot print a measured column without one`);
    return 1;
  }

  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const input = raw.input as Record<string, unknown> | undefined;
  const result = raw.result as Record<string, unknown> | undefined;
  const machine = raw.machine as Record<string, unknown> | undefined;

  if (!input || !result) {
    console.error(`${path}: input and result are required`);
    return 1;
  }

  const line = (label: string, value: unknown): void =>
    console.log(`${label.padEnd(16)} ${String(value)}`);

  console.log(`record           ${path}`);
  line("measured at", raw.measuredAt);
  line("engine", raw.engine);
  line("machine", machine?.model ?? "unknown");
  line("os", raw.os);
  line("browser", raw.browser ?? "none: this record was made in node");
  console.log("");
  console.log("input");
  line("  name", input.name);
  line("  bytes", `${input.bytes} (${megabytes(Number(input.bytes))})`);
  line("  sha256", input.sha256);
  console.log("result");
  line("  wall clock", `${Number(result.wallClockMs).toFixed(1)} ms`);
  line("  peak heap", `${result.peakHeapBytes} bytes`);
  line("  sha256", result.sha256);
  console.log("");
  console.log(
    `the client column will print ${Number(result.wallClockMs).toFixed(1)} ms, ` +
      `because that is what this file says happened`,
  );

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
