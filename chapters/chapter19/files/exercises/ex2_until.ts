/**
 * Exercise 2 - the recurrence that never ended.
 *
 * A rule with neither COUNT nor UNTIL expands forever; a page that asks for a month gets an infinite
 * list. The limit is the window, and a rule must be asked for one.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Rule = { count?: number; until?: number };

/** The bug: expand until the rule says stop, and it never does. */
export function unbounded(rule: Rule): number[] {
  const days: number[] = [];
  for (let day = 0; rule.count === undefined || day < rule.count; day += 1) {
    if (rule.until !== undefined && day >= rule.until) break;
    days.push(day);
    if (day > 100_000) throw new Error("unbounded: the rule never ends");
  }
  return days;
}

/** The repair: a window, and the smaller of the four limits. */
export function windowed(rule: Rule, days: number): number[] {
  if (!Number.isInteger(days) || days < 1) throw new Error(`window: ${days} is not a day count`);
  const end = Math.min(days, rule.count ?? days, rule.until ?? days);
  return Array.from({ length: end }, (_unused, index) => index);
}

export const checks: readonly Check[] = [
  { name: "a counted rule stops at the count", run: () => eq(windowed({ count: 5 }, 30).length, 5, "length") },
  { name: "an until stops earlier", run: () => eq(windowed({ until: 10 }, 30).length, 10, "length") },
  { name: "the window is the fallback", run: () => eq(windowed({}, 7).length, 7, "length") },
  { name: "the smallest limit wins", run: () => eq(windowed({ count: 5, until: 3 }, 30).length, 3, "length") },
  { name: "a one-day window is one day", run: () => eq(windowed({ count: 100 }, 1).length, 1, "length") },
  { name: "a zero window is refused", run: () => {
    const error = throws(() => windowed({}, 0), "zero");
    return expect(error.message.includes("day count"), error.message);
  } },
  { name: "the unbounded case is the bug", run: () => expect(throws(() => unbounded({}), "unbounded").message.includes("never ends"), "no error") },
  { name: "a counted rule ends in the buggy version too", run: () => eq(unbounded({ count: 4 }).length, 4, "length") },
  { name: "the window never exceeds the count", run: () => expect(windowed({ count: 2 }, 30).length <= 2, "over") },
];

export function main(): number {
  console.log(`window 30, none   ${windowed({}, 30).length}`);
  console.log(`window 30, x5     ${windowed({ count: 5 }, 30).length}`);
  console.log("");
  console.log("a rule without an end is a rule that needs a window");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
