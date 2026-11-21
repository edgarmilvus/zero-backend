/**
 * What a person reads: the report as text, the triage as a line, and the bundle as one file.
 */

import type { SupportReport } from "./report.ts";
import { encodeReport } from "./report.ts";
import type { Triage } from "./triage.ts";

export function renderReport(report: SupportReport): string {
  const env = report.env;
  return [
    `build             ${report.build}`,
    `notes             ${report.counts.notes}, ${report.counts.tombstones} tombstone(s)`,
    `storage           ${env.storage ? "available" : "unavailable"}, ${env.storageBytes} bytes`,
    `crypto            ${env.crypto ? "available" : "missing"}`,
    `indexeddb         ${env.indexedDb ? "available" : "missing"}`,
    `file protocol     ${env.fileProtocol ? "yes" : "no"}`,
    `checksum          ${report.checksum.slice(0, 16)}...`,
  ].join("\n");
}

export function renderTriage(value: Triage): string {
  return `${value.severity.padEnd(8)} ${value.category.padEnd(14)} ${value.firstAction}`;
}

/** The bundle: the report, the triage and the checksum, in one file a user can attach to a message. */
export function renderBundle(report: SupportReport, value: Triage): string {
  const json = encodeReport(report).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Support report</title>
<style>body{font:14px/1.6 ui-monospace,monospace;margin:28px;background:#f8f6f0;color:#1c1a17}h1{font-size:16px}
table{border-collapse:collapse}td{padding:2px 10px 2px 0;vertical-align:top}pre{background:#1c1a17;color:#f1ede3;padding:12px;overflow-x:auto}
.bad{color:#a0301e}</style></head><body>
<h1>Support report</h1>
<p id="triage">${value.severity} ${value.category}: ${value.firstAction}</p>
<table>
<tr><td>build</td><td>${report.build}</td></tr>
<tr><td>notes</td><td>${report.counts.notes} (${report.counts.tombstones} deleted)</td></tr>
<tr><td>storage</td><td>${report.env.storage ? "available" : "unavailable"}</td></tr>
<tr><td>crypto</td><td>${report.env.crypto ? "available" : "missing"}</td></tr>
<tr><td>checksum</td><td>${report.checksum.slice(0, 24)}...</td></tr>
</table>
<p>This file contains no note text. The checksum covers the report and can be recomputed with SHA-256 over its canonical JSON.</p>
<pre id="report">${json}</pre>
</body></html>`;
}
