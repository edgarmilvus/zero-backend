/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * Reading a profile is easy. Deciding that a file is not a profile is the work, and the
 * refusal has to name the field: "invalid profile" sends the reader back to the beginning,
 * "profile.engine: required" sends them to the missing line.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type ProfileRecord = {
  readonly measuredAt: string;
  readonly engine: string;
  readonly crossOriginIsolated: boolean;
  readonly tier: number;
  readonly capabilities: readonly {
    readonly id: string;
    readonly tier: number;
    readonly verdict: string;
  }[];
};

type Bag = Record<string, unknown>;

function bag(value: unknown, path: string): Bag {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Bag;
}

export function validateProfile(raw: unknown): ProfileRecord {
  const root = bag(raw, "profile");

  for (const field of ["measuredAt", "engine"] as const) {
    const value = root[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`profile.${field}: expected a non-empty string`);
    }
  }
  if (typeof root.crossOriginIsolated !== "boolean") {
    throw new Error("profile.crossOriginIsolated: expected a boolean");
  }
  if (typeof root.tier !== "number" || !Number.isFinite(root.tier)) {
    throw new Error("profile.tier: expected a finite number");
  }
  if (!Array.isArray(root.capabilities) || root.capabilities.length === 0) {
    throw new Error("profile.capabilities: expected a non-empty array");
  }

  const capabilities = root.capabilities.map((entry, index) => {
    const row = bag(entry, `profile.capabilities[${index}]`);
    if (typeof row.id !== "string") {
      throw new Error(`profile.capabilities[${index}].id: expected a string`);
    }
    if (typeof row.tier !== "number") {
      throw new Error(`profile.capabilities[${index}].tier: expected a number`);
    }
    if (typeof row.verdict !== "string") {
      throw new Error(`profile.capabilities[${index}].verdict: expected a string`);
    }
    return { id: row.id, tier: row.tier, verdict: row.verdict };
  });

  return {
    measuredAt: root.measuredAt as string,
    engine: root.engine as string,
    crossOriginIsolated: root.crossOriginIsolated,
    tier: root.tier,
    capabilities,
  };
}

/** The only function here that touches the disk. */
export function readProfile(path: string): ProfileRecord {
  return validateProfile(JSON.parse(readFileSync(path, "utf8")));
}

/** The four fields the comparison needs, and nothing else. */
export function normalize(record: ProfileRecord): {
  measuredAt: string;
  engine: string;
  tier: number;
  isolated: boolean;
} {
  return {
    measuredAt: record.measuredAt,
    engine: record.engine,
    tier: record.tier,
    isolated: record.crossOriginIsolated,
  };
}

// --- the tests this file owns -------------------------------------------------

export const GOOD = {
  measuredAt: "2026-11-20T11:10:02.786Z",
  engine: "chrome 157.0.8103.79",
  crossOriginIsolated: true,
  tier: 3,
  capabilities: [
    { id: "workers", tier: 1, verdict: "present" },
    { id: "webgpu", tier: 3, verdict: "present" },
  ],
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete profile is accepted",
    run: () => eq(validateProfile(GOOD).engine, "chrome 157.0.8103.79", "engine"),
  },
  {
    name: "a missing engine is refused by name",
    run: () => {
      const error = throws(() => validateProfile(mutate((c) => delete c.engine)), "no engine");
      return expect(error.message.includes("profile.engine"), error.message);
    },
  },
  {
    name: "a string isolation flag is refused",
    run: () => {
      const error = throws(
        () => validateProfile(mutate((c) => (c.crossOriginIsolated = "yes"))),
        "string flag",
      );
      return expect(error.message.includes("boolean"), error.message);
    },
  },
  {
    name: "an empty capability list is refused",
    run: () => {
      const error = throws(
        () => validateProfile(mutate((c) => (c.capabilities = []))),
        "empty list",
      );
      return expect(error.message.includes("non-empty"), error.message);
    },
  },
  {
    name: "a capability without an id is refused by index",
    run: () => {
      const error = throws(
        () =>
          validateProfile(
            mutate((c) => {
              (c.capabilities as Bag[])[0] = { tier: 1, verdict: "present" };
            }),
          ),
        "no id",
      );
      return expect(error.message.includes("capabilities[0].id"), error.message);
    },
  },
  {
    name: "normalize keeps the four comparison fields",
    run: () =>
      eq(
        Object.keys(normalize(validateProfile(GOOD))).join(","),
        "measuredAt,engine,tier,isolated",
        "keys",
      ),
  },
];
