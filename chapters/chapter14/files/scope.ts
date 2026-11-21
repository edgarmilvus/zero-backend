/**
 * A scope is a set of `action:resource` pairs, and a subset check is the whole authorization model.
 *
 * The temptation is a string prefix: `read` looks like it covers `read:own`. It does not — `write`
 * starts with `w`, and `read:all` starts with `read` — and a prefix check is the bug exercise 1 repairs.
 */

export type Scope = readonly string[];

const PAIR = /^[a-z][a-z0-9_-]*:[a-z0-9_*:-]+$/;

export function parseScope(values: readonly string[]): Scope {
  if (values.length === 0) throw new Error("scope: at least one action is required");
  const seen = new Set<string>();
  for (const value of values) {
    if (!PAIR.test(value)) throw new Error(`scope: ${value} is not action:resource`);
    seen.add(value);
  }
  return [...seen].sort();
}

export function isSubset(child: Scope, parent: Scope): boolean {
  const allowed = new Set(parent);
  return child.every((pair) => allowed.has(pair));
}

export function intersect(left: Scope, right: Scope): Scope {
  const other = new Set(right);
  return left.filter((pair) => other.has(pair));
}

export function describe(scope: Scope): string {
  return scope.length === 0 ? "nothing" : scope.join(", ");
}

export function parseText(text: string): Scope {
  return parseScope(text.split(",").map((part) => part.trim()).filter(Boolean));
}
