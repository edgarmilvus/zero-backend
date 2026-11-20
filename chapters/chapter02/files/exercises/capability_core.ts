/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * A core holds one entry per capability and answers two questions: what is this one, and
 * what rung does the whole machine reach. No files, no globals, no browser: the tier is
 * arithmetic on strings.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Verdict = "present" | "blocked" | "absent" | "unknown";

export type Entry = {
  readonly id: string;
  readonly tier: number;
  readonly verdict: Verdict;
};

export type Core = {
  readonly entries: readonly Entry[];
};

export function newCore(): Core {
  return { entries: [] };
}

/** A new core. Recording the same id twice replaces it, so a re-probe cannot duplicate. */
export function record(core: Core, entry: Entry): Core {
  return { entries: [...core.entries.filter((existing) => existing.id !== entry.id), entry] };
}

export function verdictOf(core: Core, id: string): Verdict {
  const entry = core.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no capability "${id}" in this core`);
  return entry.verdict;
}

/** The highest rung where everything on it and below is present. */
export function tierOf(core: Core): number {
  let reached = 0;
  for (const rung of [1, 2, 3]) {
    const onRung = core.entries.filter((entry) => entry.tier === rung);
    if (onRung.length === 0) continue;
    if (onRung.every((entry) => entry.verdict === "present")) reached = rung;
    else break;
  }
  return reached;
}

/** Everything not present, sorted, which is what a support reply lists. */
export function blocked(core: Core): readonly string[] {
  return core.entries
    .filter((entry) => entry.verdict !== "present")
    .map((entry) => entry.id)
    .sort();
}

// --- the tests this file owns -------------------------------------------------
//
// Five checks, all on literals: no filesystem, no browser, no timer.

const full = [
  { id: "workers", tier: 1, verdict: "present" as const },
  { id: "wasm", tier: 2, verdict: "present" as const },
  { id: "webgpu", tier: 3, verdict: "present" as const },
];

export const checks: readonly Check[] = [
  {
    name: "a new core is empty",
    run: () => eq(newCore().entries.length, 0, "entries"),
  },
  {
    name: "recording returns a new core",
    run: () => {
      const before = newCore();
      const after = record(before, full[0]!);
      eq(before.entries.length, 0, "original");
      return eq(after.entries.length, 1, "copy");
    },
  },
  {
    name: "a recorded verdict is found by id",
    run: () => eq(verdictOf(record(newCore(), full[1]!), "wasm"), "present", "verdict"),
  },
  {
    name: "asking for a capability that is not there throws by name",
    run: () => {
      const error = throws(() => verdictOf(newCore(), "opfs"), "missing");
      return expect(error.message.includes("opfs"), error.message);
    },
  },
  {
    name: "the tier is the highest complete rung",
    run: () => {
      const core = full.reduce(record, newCore());
      const withGap = record(core, { id: "opfs", tier: 3, verdict: "blocked" });
      eq(tierOf(core), 3, "complete");
      return eq(tierOf(withGap), 2, "with a gap");
    },
  },
];
