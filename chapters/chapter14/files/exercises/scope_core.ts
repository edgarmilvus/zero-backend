/**
 * Exercise 5, file 1 of 3 - the pure part.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Scope = readonly string[];

export function parse(values: readonly string[]): Scope {
  if (values.length === 0) throw new Error("scope: at least one pair is required");
  for (const value of values) {
    if (!/^[a-z][a-z0-9_-]*:[a-z0-9_*:-]+$/.test(value)) throw new Error(`scope: ${value} is not action:resource`);
  }
  return [...new Set(values)].sort();
}

export function subset(child: Scope, parent: Scope): boolean {
  const allowed = new Set(parent);
  return child.every((pair) => allowed.has(pair));
}

export function describe(scope: Scope): string {
  return scope.join(",");
}

export const checks: readonly Check[] = [
  { name: "a scope sorts and deduplicates", run: () => eq(parse(["b:2", "a:1", "a:1"]).join(","), "a:1,b:2", "scope") },
  { name: "an empty scope is refused", run: () => {
    const error = throws(() => parse([]), "empty");
    return expect(error.message.includes("at least one"), error.message);
  } },
  { name: "a malformed pair is refused", run: () => {
    const error = throws(() => parse(["read"]), "malformed");
    return expect(error.message.includes("action:resource"), error.message);
  } },
  { name: "a subset is inside", run: () => eq(subset(parse(["a:1"]), parse(["a:1", "b:2"])), true, "subset") },
  { name: "a superset is not", run: () => eq(subset(parse(["a:1", "b:2"]), parse(["a:1"])), false, "superset") },
];

export { describe as describeScope };
