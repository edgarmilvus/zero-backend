/**
 * Exercise 5, file 1 of 3 - the pure part.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Wall = { year: number; month: number; day: number; hour: number; minute: number };

export function addDays(wall: Wall, days: number): Wall {
  if (!Number.isInteger(days)) throw new Error(`days: ${days} is not a day count`);
  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days, wall.hour, wall.minute));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
}

export function format(wall: Wall): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)} ${pad(wall.hour)}:${pad(wall.minute)}`;
}

export function occurrences(start: Wall, count: number, everyDays: number): Wall[] {
  if (!Number.isInteger(count) || count < 1) throw new Error(`count: ${count} is not a count`);
  return Array.from({ length: count }, (_unused, index) => addDays(start, index * everyDays));
}

export const checks: readonly Check[] = [
  { name: "a day is added on the calendar", run: () => eq(addDays({ year: 2026, month: 3, day: 31, hour: 9, minute: 0 }, 1).month, 4, "month") },
  { name: "the clock reading is kept", run: () => eq(addDays({ year: 2026, month: 3, day: 28, hour: 9, minute: 0 }, 2).hour, 9, "hour") },
  { name: "format pads the fields", run: () => eq(format({ year: 2026, month: 1, day: 2, hour: 3, minute: 4 }), "2026-01-02 03:04", "format") },
  { name: "four weekly occurrences are four weeks", run: () => eq(occurrences({ year: 2026, month: 3, day: 25, hour: 9, minute: 0 }, 4, 7).length, 4, "count") },
  { name: "a fractional day count is refused", run: () => {
    const error = throws(() => addDays({ year: 2026, month: 1, day: 1, hour: 0, minute: 0 }, 1.5), "half");
    return expect(error.message.includes("day count"), error.message);
  } },
];
