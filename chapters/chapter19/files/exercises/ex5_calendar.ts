/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 *   node chapters/chapter19/files/exercises/ex5_calendar.ts <calendar.json>
 */

import { format, occurrences } from "./time_core.ts";
import { normalize, readCalendar } from "./calendar_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_calendar.ts <calendar.json>");
    return 2;
  }

  let record;
  try {
    record = readCalendar(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const first = occurrences({ year: 2026, month: 3, day: 25, hour: 9, minute: 0 }, 3, 7).map(format);

  console.log(`zone             ${record.zone}`);
  console.log(`events           ${record.events}, ${record.bytes} bytes`);
  console.log(`per event        ${numbers.bytesPerEvent.toFixed(0)} bytes`);
  console.log(`occurrences      ${record.occurrences} in ${record.windowDays} days, ${numbers.perDay.toFixed(2)} per day`);
  console.log(`first three      ${first.join(" | ")}`);

  return record.events > 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
