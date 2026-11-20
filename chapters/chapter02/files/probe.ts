/**
 * What the environment said, and what that means.
 *
 * The probe is pure: it takes the booleans somebody else collected and produces a verdict
 * per capability. That split is what makes this chapter testable without a browser, and it
 * is also the only way to pin the interesting cases, which are the ones a real machine
 * cannot be asked for on demand.
 */

import {
  CAPABILITIES,
  type Capability,
  type CapabilityId,
  type Tier,
} from "./capabilities.ts";

/**
 * The four answers. `blocked` is the one that matters: the feature exists, the page is not
 * allowed to use it, and a probe that reports a boolean cannot say so.
 */
export type Verdict = "present" | "blocked" | "absent" | "unknown";

/** What a detection pass collected. Nothing here is interpreted. */
export type Capabilities = {
  /** `globalThis.crossOriginIsolated`, which is the page's headers, not its engine. */
  readonly crossOriginIsolated: boolean;
  /** `typeof SharedArrayBuffer !== "undefined"`. */
  readonly sharedArrayBuffer: boolean;
  /** One boolean per capability, or missing when nobody probed it. */
  readonly present: Readonly<Partial<Record<CapabilityId, boolean | undefined>>>;
};

export type CapabilityReport = {
  readonly id: CapabilityId;
  readonly tier: Tier;
  readonly label: string;
  readonly verdict: Verdict;
  /** Why the verdict is what it is, in one sentence a reader can act on. */
  readonly why: string;
  readonly chapter: number;
  readonly fallback: string;
};

export type Profile = {
  /** The highest rung at which every capability is present. 0 means the page runs at all. */
  readonly tier: Tier;
  readonly reports: readonly CapabilityReport[];
  /** Everything not present, blocked or unknown, in tier order. */
  readonly gaps: readonly CapabilityReport[];
  /** Chapters that cannot run as written on this machine. */
  readonly blockedChapters: readonly number[];
};

function verdictOf(capability: Capability, caps: Capabilities): { verdict: Verdict; why: string } {
  if (capability.id === "threads") {
    if (!caps.sharedArrayBuffer) {
      return {
        verdict: "absent",
        why: "this engine has no SharedArrayBuffer, so nothing can block on another thread",
      };
    }
    if (!caps.crossOriginIsolated) {
      return {
        verdict: "blocked",
        why: "SharedArrayBuffer exists, but the page is not cross-origin isolated: send COOP and COEP",
      };
    }
    if (caps.present.workers === false) {
      return { verdict: "blocked", why: "isolation is in place, but this engine has no Worker" };
    }
    if (caps.present.workers === undefined) {
      return { verdict: "unknown", why: "isolation is in place, but the Worker probe did not run" };
    }
    return { verdict: "present", why: "isolation and SharedArrayBuffer are both in place" };
  }

  const missing = capability.needs.filter((need) => caps.present[need] === false);
  if (missing.length > 0) {
    return {
      verdict: "blocked",
      why: `needs ${missing.join(", ")}, which this machine does not have`,
    };
  }

  const value = caps.present[capability.id];
  if (value === undefined) {
    return {
      verdict: "unknown",
      why: "nobody probed it: unknown is not the same answer as absent",
    };
  }
  if (value) {
    return { verdict: "present", why: "the probe touched it and it answered" };
  }
  return { verdict: "absent", why: "the probe looked for it and it is not there" };
}

/** The whole profile: one verdict per capability, one tier, one list of blocked chapters. */
export function probe(caps: Capabilities): Profile {
  const reports: CapabilityReport[] = CAPABILITIES.map((capability) => {
    const { verdict, why } = verdictOf(capability, caps);
    return {
      id: capability.id,
      tier: capability.tier,
      label: capability.label,
      verdict,
      why,
      chapter: capability.chapter,
      fallback: capability.fallback,
    };
  });

  const gaps = reports.filter((report) => report.verdict !== "present");
  const blockedChapters = [
    ...new Set(
      reports.filter((report) => report.verdict !== "present").map((report) => report.chapter),
    ),
  ].sort((a, b) => a - b);

  return { tier: highestTier(reports), reports, gaps, blockedChapters };
}

/**
 * The top rung where every capability is present.
 *
 * Cumulative on purpose: a machine at tier 3 has tiers 1 and 2 as well, because a chapter
 * that needs tier 3 has already used everything below it. An unknown capability stops the
 * climb, which is what makes "unknown is not yes" disagreeable but correct.
 */
export function highestTier(reports: readonly CapabilityReport[]): Tier {
  let tier: Tier = 0;
  for (const rung of [1, 2, 3] as const) {
    const onRung = reports.filter((report) => report.tier === rung);
    if (onRung.length === 0) continue;
    if (onRung.every((report) => report.verdict === "present")) tier = rung;
    else break;
  }
  return tier;
}

/** Everything that is not present, in the order a reader should care about it. */
export function gaps(profile: Profile): readonly CapabilityReport[] {
  return profile.gaps;
}

/** For each chapter that has a requirement, whether this machine can run it. */
export function chaptersThatRun(
  profile: Profile,
): readonly { readonly chapter: number; readonly ok: boolean; readonly missing: readonly CapabilityId[] }[] {
  const byChapter = new Map<number, CapabilityReport[]>();
  for (const report of profile.reports) {
    const list = byChapter.get(report.chapter) ?? [];
    list.push(report);
    byChapter.set(report.chapter, list);
  }

  return [...byChapter.entries()]
    .sort(([a], [b]) => a - b)
    .map(([chapter, reports]) => ({
      chapter,
      ok: reports.every((report) => report.verdict === "present"),
      missing: reports.filter((report) => report.verdict !== "present").map((report) => report.id),
    }));
}

/** A short word a table can print, padded to a fixed width by the caller. */
export function formatVerdict(verdict: Verdict): string {
  switch (verdict) {
    case "present":
      return "yes";
    case "blocked":
      return "blocked";
    case "absent":
      return "no";
    case "unknown":
      return "unknown";
  }
}
