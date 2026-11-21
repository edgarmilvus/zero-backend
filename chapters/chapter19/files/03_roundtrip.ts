/**
 * Example 3 - the file, and the same calendar back.
 *
 *   node chapters/chapter19/files/03_roundtrip.ts
 */

import { fromIcs, toIcs } from "./ics.ts";
import type { Calendar } from "./calendar.ts";

const CALENDAR: Calendar = {
  events: [
    {
      uid: "standup@zero-backend",
      summary: "Standup, with a comma; and a semicolon",
      zone: "Europe/Rome",
      start: { year: 2026, month: 3, day: 25, hour: 9, minute: 0 },
      durationMinutes: 15,
      rule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=30",
      sequence: 1,
      updatedAt: 1_700_000_000_000,
    },
  ],
};

export function main(): number {
  const text = toIcs(CALENDAR.events, 1_700_000_000_000);
  const back = fromIcs(text);

  console.log(`bytes             ${new TextEncoder().encode(text).byteLength}`);
  console.log(`lines             ${text.split("\r\n").length - 1}`);
  console.log(`events back       ${back.length}`);
  console.log(`summary           ${back[0]?.summary}`);
  console.log(`rule              ${back[0]?.rule}`);
  console.log("");
  console.log(`round trip        ${back[0]?.summary === CALENDAR.events[0]!.summary && back[0]?.rule === CALENDAR.events[0]!.rule}`);

  return back[0]?.summary === CALENDAR.events[0]!.summary ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
