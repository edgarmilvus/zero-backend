/**
 * Example 1 - a report from a healthy install.
 *
 *   node chapters/chapter17/files/01_report.ts
 */

import { collect } from "./diagnostics.ts";
import { buildReport, checkReport } from "./report.ts";
import { renderReport } from "./render.ts";

export function main(): Promise<number> {
  return (async () => {
    const diagnostics = collect({ storage: true, crypto: true, indexedDb: true, fileProtocol: false, storageBytes: 4_096 }, "1.4.0");
    const report = await buildReport({ diagnostics, notes: 12, tombstones: 2, secrets: [] });

    console.log(renderReport(report));
    const checked = await checkReport(JSON.parse(JSON.stringify(report)));
    console.log("");
    console.log(`recipient check   ${checked.ok ? "ok" : checked.reason}`);
    return checked.ok ? 0 : 1;
  })();
}

if (import.meta.main) {
  process.exit(await main());
}
