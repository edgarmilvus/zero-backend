/**
 * Example 2 - a rule, expanded.
 *
 *   node chapters/chapter19/files/02_expand.ts
 */

import { describeRule, expand } from "./recur.ts";
import { renderOccurrence } from "./report.ts";

const ZONE = "Europe/Rome";

export function main(): number {
  const rule = { freq: "WEEKLY" as const, byDay: [3], count: 5 };
  const occurrences = expand(ZONE, { year: 2026, month: 3, day: 25, hour: 9, minute: 0 }, rule);

  console.log(`rule              ${describeRule(rule)}`);
  for (const occurrence of occurrences) console.log(renderOccurrence(occurrence, ZONE));
  console.log("");
  console.log("five Wednesdays at nine, and the instant changes once in the middle");

  return occurrences.length === 5 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
