/**
 * Exercise 1 - the thread test that says yes on a page with no headers.
 *
 * The bug is one line: `sharedArrayBuffer` exists, therefore threads are available. The
 * page was never served with COOP and COEP, so `Atomics.wait` throws on the first call and
 * chapter 4's transcode dies after the module has loaded and the user has waited.
 *
 * The repair is not to add the headers here; it is to teach the probe that a feature can be
 * present and forbidden at the same time, and to report the third answer.
 */

import { CAPABILITIES } from "../capabilities.ts";
import {
  formatVerdict,
  probe,
  type Capabilities,
  type Verdict,
} from "../probe.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

/** The bug: presence of the buffer is read as availability of threads. */
export function brokenVerdict(caps: Capabilities): Verdict {
  return caps.sharedArrayBuffer ? "present" : "absent";
}

/** The repair: presence plus permission, and a verdict that names the missing half. */
export function fixedVerdict(caps: Capabilities): Verdict {
  if (!caps.sharedArrayBuffer) return "absent";
  if (!caps.crossOriginIsolated) return "blocked";
  return "present";
}

/** The sentence a support engineer needs, and the fallback a product owner needs. */
export function blockedBecause(caps: Capabilities): { why: string; fallback: string } {
  const threads = CAPABILITIES.find((capability) => capability.id === "threads");
  const fallback = threads?.fallback ?? "";
  if (!caps.sharedArrayBuffer) {
    return { why: "this engine has no SharedArrayBuffer", fallback };
  }
  return {
    why: "the page is not cross-origin isolated: send COOP and COEP",
    fallback,
  };
}

const WITHOUT_HEADERS: Capabilities = {
  crossOriginIsolated: false,
  sharedArrayBuffer: true,
  present: { workers: true },
};

const WITH_HEADERS: Capabilities = { ...WITHOUT_HEADERS, crossOriginIsolated: true };

export const checks: readonly Check[] = [
  {
    name: "the broken probe calls threads present without isolation",
    run: () => eq(brokenVerdict(WITHOUT_HEADERS), "present", "broken verdict"),
  },
  {
    name: "the repaired probe calls them blocked",
    run: () => eq(fixedVerdict(WITHOUT_HEADERS), "blocked", "fixed verdict"),
  },
  {
    name: "with the headers, the repaired probe says present",
    run: () => eq(fixedVerdict(WITH_HEADERS), "present", "fixed verdict"),
  },
  {
    name: "an engine without the buffer is still absent, not blocked",
    run: () =>
      eq(fixedVerdict({ ...WITHOUT_HEADERS, sharedArrayBuffer: false }), "absent", "verdict"),
  },
  {
    name: "the reason names the two headers",
    run: () => expect(blockedBecause(WITHOUT_HEADERS).why.includes("COOP and COEP"), "why"),
  },
  {
    name: "the fallback is the chapter's, not a shrug",
    run: () => expect(blockedBecause(WITHOUT_HEADERS).fallback.includes("single-threaded"), "fallback"),
  },
  {
    name: "the full profile agrees with the repaired probe",
    run: () => {
      const report = probe(WITHOUT_HEADERS).reports.find((r) => r.id === "threads");
      expect(report?.verdict === fixedVerdict(WITHOUT_HEADERS), "disagreement");
      return expect(formatVerdict(report?.verdict ?? "unknown") === "blocked", "word");
    },
  },
  {
    name: "and chapter four is marked as degraded",
    run: () => expect(probe(WITHOUT_HEADERS).blockedChapters.includes(4), "chapter 4"),
  },
];

export function main(): number {
  console.log(`without headers   broken ${brokenVerdict(WITHOUT_HEADERS)}  fixed ${fixedVerdict(WITHOUT_HEADERS)}`);
  console.log(`with headers      broken ${brokenVerdict(WITH_HEADERS)}  fixed ${fixedVerdict(WITH_HEADERS)}`);
  console.log("");
  console.log(`why               ${blockedBecause(WITHOUT_HEADERS).why}`);
  console.log(`instead           ${blockedBecause(WITHOUT_HEADERS).fallback}`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
