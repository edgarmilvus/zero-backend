/**
 * Exercise 1 - the scope that allowed more than it said.
 *
 * A prefix check refuses `write:own` inside `read:own`? No — it accepts it, because "write" shares no
 * prefix with "read"... but `read:all`.startsWith("read") is true, and `write:own`.startsWith("w") is
 * true for a parent of `w`. Prefixes are not sets, and the fixture shows both directions.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Scope = readonly string[];

/** The bug: a scope is a prefix of the allowed text. */
export function allowsByPrefix(allowed: string, requested: string): boolean {
  return requested.split(",").every((pair) => pair.trim().startsWith(allowed.trim()));
}

/** The repair: both are sets of pairs and the requested set must be inside the allowed set. */
export function allowsBySet(allowed: readonly string[], requested: readonly string[]): boolean {
  if (allowed.length === 0) throw new Error("scope: the allowed set is empty");
  const set = new Set(allowed.map((pair) => pair.trim()));
  return requested.every((pair) => set.has(pair.trim()));
}

export const checks: readonly Check[] = [
  { name: "the prefix check accepts read:all for read", run: () => eq(allowsByPrefix("read", "read:all"), true, "prefix") },
  { name: "the set check refuses it", run: () => eq(allowsBySet(["read:own"], ["read:all"]), false, "set") },
  { name: "the prefix check refuses a pair that is allowed", run: () => eq(allowsByPrefix("read:own", "write:own"), false, "prefix") },
  { name: "the set check refuses it too, and for the right reason", run: () => eq(allowsBySet(["read:own"], ["write:own"]), false, "set") },
  { name: "both accept an exact pair", run: () => {
    eq(allowsByPrefix("read:own", "read:own"), true, "prefix");
    return eq(allowsBySet(["read:own"], ["read:own"]), true, "set");
  } },
  { name: "the set check accepts a subset", run: () => eq(allowsBySet(["read:own", "write:own"], ["read:own"]), true, "subset") },
  { name: "the set check refuses a superset", run: () => eq(allowsBySet(["read:own"], ["read:own", "write:own"]), false, "superset") },
  { name: "an empty allowed set is refused instead of allowing nothing", run: () => {
    const error = throws(() => allowsBySet([], ["read:own"]), "empty");
    return expect(error.message.includes("empty"), error.message);
  } },
];

export function main(): number {
  console.log(`prefix            read:all inside read -> ${allowsByPrefix("read", "read:all")}`);
  console.log(`set               read:all inside read:own -> ${allowsBySet(["read:own"], ["read:all"])}`);
  console.log("");
  console.log("a scope is a set of pairs; a prefix is a string, and strings are not sets");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
