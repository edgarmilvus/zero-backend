/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type CalendarRecord = {
  readonly events: number;
  readonly bytes: number;
  readonly zone: string;
  readonly occurrences: number;
  readonly windowDays: number;
};

export function validateCalendar(raw: unknown): CalendarRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("calendar: expected an object");
  const root = raw as Record<string, unknown>;
  const count = (value: unknown, path: string, min = 1): number => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
      throw new Error(`${path}: expected an integer >= ${min}`);
    }
    return value;
  };

  const record: CalendarRecord = {
    events: count(root.events, "calendar.events"),
    bytes: count(root.bytes, "calendar.bytes"),
    zone: typeof root.zone === "string" && root.zone !== "" ? root.zone : (() => {
      throw new Error("calendar.zone: expected an IANA zone");
    })(),
    occurrences: count(root.occurrences, "calendar.occurrences", 0),
    windowDays: count(root.windowDays, "calendar.windowDays"),
  };

  const perDay = record.occurrences / record.windowDays;
  if (perDay > record.events * 2) {
    throw new Error(`calendar.occurrences: ${record.occurrences} in ${record.windowDays} days is more than the events can produce`);
  }

  return record;
}

export function readCalendar(path: string): CalendarRecord {
  return validateCalendar(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(record: CalendarRecord): { bytesPerEvent: number; perDay: number } {
  return { bytesPerEvent: record.bytes / record.events, perDay: record.occurrences / record.windowDays };
}

export const GOOD = { events: 3, bytes: 1_200, zone: "Europe/Rome", occurrences: 12, windowDays: 30 };

function mutate(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  { name: "a complete record is accepted", run: () => eq(validateCalendar(GOOD).events, 3, "events") },
  { name: "zero events is refused", run: () => {
    const error = throws(() => validateCalendar(mutate((c) => (c.events = 0))), "events");
    return expect(error.message.includes(">= 1"), error.message);
  } },
  { name: "an empty zone is refused", run: () => {
    const error = throws(() => validateCalendar(mutate((c) => (c.zone = ""))), "zone");
    return expect(error.message.includes("IANA"), error.message);
  } },
  { name: "a zero window is refused", run: () => {
    const error = throws(() => validateCalendar(mutate((c) => (c.windowDays = 0))), "window");
    return expect(error.message.includes(">= 1"), error.message);
  } },
  { name: "more occurrences than the events can produce is refused", run: () => {
    const error = throws(() => validateCalendar(mutate((c) => (c.occurrences = 10_000))), "occurrences");
    return expect(error.message.includes("more than"), error.message);
  } },
  { name: "normalize derives the size and the density", run: () => eq(Object.keys(normalize(validateCalendar(GOOD))).join(","), "bytesPerEvent,perDay", "keys") },
];
