/**
 * Example 2 - a subset is a set of pairs, not a prefix.
 *
 *   node chapters/chapter14/files/02_scope.ts
 *
 * `write:own`.startsWith("read") is false, and `read:all`.startsWith("read") is true — which is why a
 * prefix check refuses one valid pair and accepts one it should refuse. The set comparison gets both.
 */

import { describe, isSubset, parseText, type Scope } from "./scope.ts";

const CASES: readonly { child: string; parent: string; allow: boolean }[] = [
  { child: "read:own", parent: "read:own,write:own", allow: true },
  { child: "read:own,write:own", parent: "read:own", allow: false },
  { child: "write:own", parent: "read:own", allow: false },
  { child: "read:all", parent: "read:own", allow: false },
  { child: "read:own", parent: "read:all", allow: false },
];

export function main(): number {
  let agreed = 0;
  for (const item of CASES) {
    const child = parseText(item.child);
    const parent = parseText(item.parent);
    const subset = isSubset(child, parent);
    const byPrefix = child.every((pair) => item.parent.split(",").some((allowed) => pair.startsWith(allowed)));
    if (subset === item.allow) agreed += 1;
    console.log(
      `${item.child.padEnd(18)} in ${item.parent.padEnd(18)} set ${String(subset).padEnd(5)} prefix ${String(byPrefix).padEnd(5)} ${subset === item.allow ? "" : "WRONG"}`,
    );
  }

  console.log("");
  console.log(`scope                 ${describe(parseText("read:own,write:own"))}`);
  console.log(`${agreed}/${CASES.length} cases agree with the policy`);

  return agreed === CASES.length ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
