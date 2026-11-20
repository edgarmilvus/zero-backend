/**
 * Exercise 4 - the profile that only knows one machine.
 *
 * A record with the twelve verdicts and nothing else is not a comparison, it is a
 * screenshot. The two laptops differ, and without the engine, the date and the isolation
 * flag nobody can say whether the difference is the browser, the machine or the headers.
 *
 * The repair is a validator with four required fields, each named when it is missing.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type ProfileRecord = {
  readonly measuredAt: string;
  readonly engine: string;
  readonly crossOriginIsolated: boolean;
  readonly tier: number;
  readonly capabilities: readonly { readonly id: string; readonly verdict: string }[];
};

const REQUIRED = ["measuredAt", "engine", "crossOriginIsolated", "tier"] as const;

/** The bug: a cast, and a record that is only as good as the file happened to be. */
export function brokenRead(raw: unknown): ProfileRecord {
  return raw as ProfileRecord;
}

/** The repair: four fields, each one named in the refusal. */
export function readProfile(raw: unknown): ProfileRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("profile: expected an object");
  }
  const bag = raw as Record<string, unknown>;

  for (const field of REQUIRED) {
    const value = bag[field];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "");
    if (missing) throw new Error(`profile.${field}: required, and it is missing`);
  }

  if (typeof bag.crossOriginIsolated !== "boolean") {
    throw new Error("profile.crossOriginIsolated: expected a boolean");
  }
  if (typeof bag.tier !== "number" || !Number.isFinite(bag.tier)) {
    throw new Error("profile.tier: expected a finite number");
  }
  if (!Array.isArray(bag.capabilities)) {
    throw new Error("profile.capabilities: expected an array");
  }

  return bag as unknown as ProfileRecord;
}

const GOOD: ProfileRecord = {
  measuredAt: "2026-11-20T11:10:02.786Z",
  engine: "chrome 157.0.8103.79",
  crossOriginIsolated: true,
  tier: 3,
  capabilities: [{ id: "webcodecs", verdict: "present" }],
};

function without(field: (typeof REQUIRED)[number]): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  delete copy[field];
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete profile is accepted",
    run: () => eq(readProfile(GOOD).engine, "chrome 157.0.8103.79", "engine"),
  },
  {
    name: "a profile with no engine is refused by name",
    run: () => {
      const error = throws(() => readProfile(without("engine")), "no engine");
      return expect(error.message.includes("profile.engine"), error.message);
    },
  },
  {
    name: "a profile with no date is refused by name",
    run: () => {
      const error = throws(() => readProfile(without("measuredAt")), "no date");
      return expect(error.message.includes("profile.measuredAt"), error.message);
    },
  },
  {
    name: "a profile with no isolation flag is refused by name",
    run: () => {
      const error = throws(() => readProfile(without("crossOriginIsolated")), "no flag");
      return expect(error.message.includes("profile.crossOriginIsolated"), error.message);
    },
  },
  {
    name: "an isolation flag that is a string is refused",
    run: () => {
      const copy = { ...GOOD, crossOriginIsolated: "true" } as unknown;
      const error = throws(() => readProfile(copy), "string flag");
      return expect(error.message.includes("boolean"), error.message);
    },
  },
  {
    name: "the broken reader accepts all of those",
    run: () => expect(brokenRead(without("engine")).engine === undefined, "the bug is real"),
  },
  {
    name: "an empty object is refused",
    run: () => {
      const error = throws(() => readProfile({}), "empty");
      return expect(error.message.includes("measuredAt"), error.message);
    },
  },
  {
    name: "an array is not a profile",
    run: () => {
      const error = throws(() => readProfile([]), "array");
      return expect(error.message.includes("expected an object"), error.message);
    },
  },
  {
    name: "a tier that is a string is refused",
    run: () => {
      const copy = { ...GOOD, tier: "3" } as unknown;
      const error = throws(() => readProfile(copy), "string tier");
      return expect(error.message.includes("finite number"), error.message);
    },
  },
];

export function main(): number {
  console.log(`good profile     ${readProfile(GOOD).engine}, tier ${readProfile(GOOD).tier}`);
  for (const field of REQUIRED) {
    try {
      readProfile(without(field));
      console.log(`without ${field.padEnd(18)} accepted (bug)`);
    } catch (error) {
      console.log(`without ${field.padEnd(18)} ${(error as Error).message}`);
    }
  }
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
