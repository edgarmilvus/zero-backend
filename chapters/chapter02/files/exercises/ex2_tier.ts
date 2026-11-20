/**
 * Exercise 2 - a tier computed from the wrong direction.
 *
 * The profile reports tier 3 because WebGPU is there, while WebCodecs is missing. Every
 * chapter that reads the tier assumes the rungs below it are complete, so chapter 5 runs on
 * a machine that cannot decode a frame.
 *
 * `highest` is the bug: the maximum rung with anything present. `cumulative` is the repair:
 * the highest rung where every capability, on that rung and below, is present.
 */

import { CAPABILITIES, type Tier } from "../capabilities.ts";
import { probe, type Capabilities, type Profile } from "../probe.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

/** The bug: the highest rung that has any capability present. */
export function highest(profile: Profile): Tier {
  let top: Tier = 0;
  for (const report of profile.reports) {
    if (report.verdict !== "present") continue;
    if (report.tier > top) top = report.tier;
  }
  return top;
}

/** The repair: the highest rung where everything up to it is present. */
export function cumulative(profile: Profile): Tier {
  let reached: Tier = 0;
  for (const rung of [1, 2, 3] as const) {
    const onRung = profile.reports.filter((report) => report.tier === rung);
    if (onRung.length === 0) continue;
    if (onRung.every((report) => report.verdict === "present")) reached = rung;
    else break;
  }
  return reached;
}

const ONLY_GPU: Capabilities = {
  crossOriginIsolated: false,
  sharedArrayBuffer: false,
  present: { webgpu: true },
};

const NO_CODECS: Capabilities = {
  crossOriginIsolated: true,
  sharedArrayBuffer: true,
  present: Object.fromEntries(
    CAPABILITIES.filter((c) => c.id !== "webcodecs").map((c) => [c.id, true]),
  ) as Capabilities["present"],
};

export const checks: readonly Check[] = [
  {
    name: "one tier 3 capability present is not tier 3",
    run: () => eq(highest(probe(ONLY_GPU)), 3, "the bug reports 3"),
  },
  {
    name: "the repaired tier for that machine is 0",
    run: () => eq(cumulative(probe(ONLY_GPU)), 0, "tier"),
  },
  {
    name: "a complete rung 1 with a rung 2 gap is tier 1",
    run: () => eq(cumulative(probe(NO_CODECS)), 1, "tier"),
  },
  {
    name: "the bug reports 3 for the same machine",
    run: () => eq(highest(probe(NO_CODECS)), 3, "the bug reports 3"),
  },
  {
    name: "a gap on rung 1 keeps the machine at 0",
    run: () => {
      const noWorkers: Capabilities = {
        ...NO_CODECS,
        present: { ...NO_CODECS.present, workers: false },
      };
      return eq(cumulative(probe(noWorkers)), 0, "tier");
    },
  },
  {
    name: "an unknown capability is a gap, not a pass",
    run: () => {
      // Rungs 1 and 2 complete, one rung 3 capability never probed.
      const unknown: Capabilities = {
        ...NO_CODECS,
        present: { ...NO_CODECS.present, webcodecs: true, webgpu: undefined },
      };
      return eq(cumulative(probe(unknown)), 2, "tier");
    },
  },
  {
    name: "the repaired tier agrees with the profile's own tier",
    run: () => eq(cumulative(probe(NO_CODECS)), probe(NO_CODECS).tier, "agreement"),
  },
  {
    name: "the repaired tier never exceeds three",
    run: () => expect(cumulative(probe(NO_CODECS)) <= 3, "bound"),
  },
  {
    name: "a machine with every rung complete reaches three",
    run: () => {
      const all: Capabilities = {
        crossOriginIsolated: true,
        sharedArrayBuffer: true,
        present: Object.fromEntries(CAPABILITIES.map((c) => [c.id, true])) as Capabilities["present"],
      };
      return eq(cumulative(probe(all)), 3, "tier");
    },
  },
];

export function main(): number {
  const gpuOnly = probe(ONLY_GPU);
  const noCodecs = probe(NO_CODECS);
  console.log(`only webgpu   bug ${highest(gpuOnly)}  repaired ${cumulative(gpuOnly)}`);
  console.log(`no webcodecs  bug ${highest(noCodecs)}  repaired ${cumulative(noCodecs)}`);
  console.log("");
  console.log("a tier is a promise about the rungs below it, not a prize for the highest one");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
