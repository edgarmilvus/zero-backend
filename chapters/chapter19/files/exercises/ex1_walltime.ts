/**
 * Exercise 1 - the meeting that moved by an hour.
 *
 * Adding seven days as 604,800,000 milliseconds crosses a daylight saving change and moves a 09:00
 * meeting to 08:00 or 10:00. The wall clock is what recurs; the date arithmetic is on the calendar.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Wall = { year: number; month: number; day: number; hour: number; minute: number };

/** The bug: a week is a fixed number of milliseconds. */
export function byMillis(start: Wall, days: number, offsetBefore: number, offsetAfter: number): Wall {
  const instant = Date.UTC(start.year, start.month - 1, start.day, start.hour, start.minute) - offsetBefore * 3_600_000;
  const moved = new Date(instant + days * 86_400_000 + offsetAfter * 3_600_000);
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate(), hour: moved.getUTCHours(), minute: moved.getUTCMinutes() };
}

/** The repair: add the days on the wall calendar and keep the clock reading. */
export function byCalendar(start: Wall, days: number): Wall {
  const moved = new Date(Date.UTC(start.year, start.month - 1, start.day + days, start.hour, start.minute));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate(), hour: moved.getUTCHours(), minute: moved.getUTCMinutes() };
}

const START: Wall = { year: 2026, month: 3, day: 25, hour: 9, minute: 0 };

export const checks: readonly Check[] = [
  { name: "the millisecond week moves the meeting after the change", run: () => eq(byMillis(START, 7, 1, 2).hour, 10, "hour") },
  { name: "the calendar week does not", run: () => eq(byCalendar(START, 7).hour, 9, "hour") },
  { name: "the date agrees", run: () => eq(byCalendar(START, 7).day, 1, "day") },
  { name: "the month changes", run: () => eq(byCalendar(START, 7).month, 4, "month") },
  { name: "before the change both agree", run: () => eq(byMillis({ ...START, day: 18 }, 7, 1, 1).hour, byCalendar({ ...START, day: 18 }, 7).hour, "agree") },
  { name: "the calendar arithmetic handles a month end", run: () => eq(byCalendar({ year: 2026, month: 1, day: 31, hour: 9, minute: 0 }, 1).month, 2, "month") },
  { name: "the minute is preserved", run: () => eq(byCalendar({ ...START, minute: 45 }, 7).minute, 45, "minute") },
  { name: "a leap day is a calendar fact", run: () => eq(byCalendar({ year: 2028, month: 2, day: 28, hour: 9, minute: 0 }, 1).day, 29, "day") },
];

export function main(): number {
  console.log(`millis            ${JSON.stringify(byMillis(START, 7, 1, 2))}`);
  console.log(`calendar          ${JSON.stringify(byCalendar(START, 7))}`);
  console.log("");
  console.log("a week is not a number of milliseconds; it is seven turns of a calendar");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
