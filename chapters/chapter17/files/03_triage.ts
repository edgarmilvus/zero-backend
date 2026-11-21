/**
 * Example 3 - five reports, five first actions.
 *
 *   node chapters/chapter17/files/03_triage.ts
 */

import { collect } from "./diagnostics.ts";
import { buildReport, type SupportReport } from "./report.ts";
import { describe, triage } from "./triage.ts";

async function report(probe: Parameters<typeof collect>[0], notes: number, message?: string): Promise<SupportReport> {
  return buildReport({
    diagnostics: collect(probe, "1.4.0"),
    notes,
    tombstones: 0,
    ...(message === undefined ? {} : { error: { message, at: 1 } }),
    secrets: [],
  });
}

export function main(): Promise<number> {
  return (async () => {
    const cases: readonly [string, SupportReport][] = [
      ["no storage", await report({ storage: false }, 3)],
      ["store not read", await report({ storage: true, storageBytes: 4_096 }, 0)],
      ["no crypto", await report({ storage: true, crypto: false, storageBytes: 100 }, 3)],
      ["import failed", await report({ storage: true, crypto: true, storageBytes: 100 }, 3, "the notes were changed after the file was sealed")],
      ["share expired", await report({ storage: true, crypto: true, storageBytes: 100 }, 3, "the permission expired at 2026-01-01")],
    ];

    for (const [label, value] of cases) {
      console.log(`${label.padEnd(15)} ${describe(triage(value))}`);
    }

    const categories = cases.map(([, value]) => triage(value).category);
    console.log("");
    console.log(`categories        ${new Set(categories).size} distinct of ${categories.length}`);
    return new Set(categories).size === cases.length ? 0 : 1;
  })();
}

if (import.meta.main) {
  process.exit(await main());
}
