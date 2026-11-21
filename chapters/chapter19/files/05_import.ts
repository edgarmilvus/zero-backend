/**
 * Example 5 - a file from another app.
 *
 *   node chapters/chapter19/files/05_import.ts
 *
 * A folded line, an escaped comma and a SUMMARY that comes back exactly as written. Two malformed files
 * are refused with the reason.
 */

import { fromIcs } from "./ics.ts";

const FILE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:external-1",
  "DTSTAMP:20260301T100000Z",
  "DTSTART;TZID=Europe/Rome:20260402T100000",
  "DURATION:PT60M",
  "RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=4",
  "SUMMARY:Quarterly review\\, with the whole team and a very long title that folds",
  "SEQUENCE:3",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

export function main(): number {
  const events = fromIcs(FILE);
  console.log(`events            ${events.length}`);
  console.log(`summary           ${events[0]?.summary}`);
  console.log(`zone              ${events[0]?.zone}`);
  console.log(`sequence          ${events[0]?.sequence}`);

  let refused = 0;
  for (const bad of ["BEGIN:VEVENT\r\nDTSTART;TZID=Europe/Rome:20260402T100000\r\nEND:VEVENT", FILE.replace("UID:external-1\r\n", "")]) {
    try {
      fromIcs(bad);
      console.error("accepted a malformed file");
      return 1;
    } catch (error) {
      refused += 1;
      console.log(`refused           ${(error as Error).message}`);
    }
  }

  console.log("");
  console.log(`${refused} malformed files refused, and the comma survived the round trip`);
  return events[0]?.summary.includes(",") && refused === 2 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
