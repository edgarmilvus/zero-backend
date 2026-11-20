/**
 * Example 5 - unknown is not false.
 *
 *   node chapters/chapter02/files/05_unknown_is_not_false.ts
 *
 * Three machines that are all "not present" to a boolean probe, and three different
 * verdicts. The difference decides whether a chapter degrades, refuses, or has to be
 * verified again on this device before anybody promises anything.
 */

import { probe, type Capabilities } from "./probe.ts";
import { formatVerdict } from "./probe.ts";
import { detectCapabilities } from "./detect.ts";

const base = detectCapabilities();

const neverProbed: Capabilities = {
  ...base,
  present: { ...base.present, webcodecs: undefined },
};

const lookedAndMissing: Capabilities = {
  ...base,
  present: { ...base.present, webcodecs: false },
};

const existsButForbidden: Capabilities = {
  ...base,
  sharedArrayBuffer: true,
  crossOriginIsolated: false,
  present: { ...base.present, workers: true },
};

export function main(): number {
  const rows: [string, Capabilities][] = [
    ["never probed", neverProbed],
    ["probed, absent", lookedAndMissing],
    ["present, blocked", existsButForbidden],
  ];

  for (const [label, caps] of rows) {
    const profile = probe(caps);
    const webcodecs = profile.reports.find((report) => report.id === "webcodecs");
    const threads = profile.reports.find((report) => report.id === "threads");
    console.log(label.padEnd(18), `webcodecs ${formatVerdict(webcodecs?.verdict ?? "unknown")}`);
    console.log("".padEnd(18), `threads  ${formatVerdict(threads?.verdict ?? "unknown")}  ${threads?.why ?? ""}`);
    console.log("".padEnd(18), `tier     ${profile.tier}`);
    console.log("");
  }

  const unknown = probe(neverProbed);
  const absent = probe(lookedAndMissing);
  console.log(
    `same boolean, different answer: tier ${unknown.tier} against tier ${absent.tier}`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
