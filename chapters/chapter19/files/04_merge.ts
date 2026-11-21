/**
 * Example 4 - two files, one calendar.
 *
 *   node chapters/chapter19/files/04_merge.ts
 */

import { mergeCalendars, type Calendar } from "./calendar.ts";

const A: Calendar = {
  events: [
    { uid: "a", summary: "Dentist", zone: "Europe/Rome", start: { year: 2026, month: 4, day: 2, hour: 10, minute: 0 }, durationMinutes: 60, sequence: 1, updatedAt: 100 },
    { uid: "b", summary: "Standup", zone: "Europe/Rome", start: { year: 2026, month: 4, day: 3, hour: 9, minute: 0 }, durationMinutes: 15, sequence: 1, updatedAt: 100 },
  ],
};

const B: Calendar = {
  events: [
    { uid: "b", summary: "Standup (moved)", zone: "Europe/Rome", start: { year: 2026, month: 4, day: 3, hour: 9, minute: 30 }, durationMinutes: 15, sequence: 2, updatedAt: 200 },
    { uid: "c", summary: "Flight", zone: "Europe/Rome", start: { year: 2026, month: 4, day: 5, hour: 7, minute: 0 }, durationMinutes: 120, sequence: 1, updatedAt: 150 },
  ],
};

export function main(): number {
  const merged = mergeCalendars(A, B);
  console.log(`events            ${merged.calendar.events.length}`);
  console.log(`added             ${merged.added}`);
  console.log(`conflicts         ${merged.conflicts}`);
  const standup = merged.calendar.events.find((event) => event.uid === "b");
  console.log(`standup at        ${standup?.start.hour}:${String(standup?.start.minute).padStart(2, "0")}`);
  console.log("");
  console.log("the higher sequence wins, and the merge is the chapter 13 rule on a UID");

  return merged.calendar.events.length === 3 && standup?.start.minute === 30 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
