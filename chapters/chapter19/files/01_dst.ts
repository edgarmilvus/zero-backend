/**
 * Example 1 - the meeting that stays at nine.
 *
 *   node chapters/chapter19/files/01_dst.ts
 *
 * Europe/Rome moves on 29 March 2026. The wall clock is 09:00 on both sides of the change; the instant
 * moves by an hour, which is the whole chapter in four lines of output.
 */

import { addDays, formatWall, offsetMinutes, wallToInstant } from "./time.ts";

const ZONE = "Europe/Rome";
const START = { year: 2026, month: 3, day: 25, hour: 9, minute: 0 };

export function main(): number {
  const before = wallToInstant(ZONE, START);
  const after = wallToInstant(ZONE, addDays(ZONE, START, 7));

  console.log(`offset before     ${offsetMinutes(ZONE, before)} minutes`);
  console.log(`offset after      ${offsetMinutes(ZONE, after)} minutes`);
  console.log(`before            ${formatWall(START)} -> ${before.toISOString()}`);
  console.log(`after             ${formatWall(addDays(ZONE, START, 7))} -> ${after.toISOString()}`);
  const week = before.getTime() + 7 * 86_400_000;
  console.log(`instant delta     ${(after.getTime() - week) / 3_600_000} hour versus a plain week`);
  console.log("");
  console.log("the appointment is at nine in both; the instant is an hour earlier the second time");

  return offsetMinutes(ZONE, before) === 60 && offsetMinutes(ZONE, after) === 120 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
