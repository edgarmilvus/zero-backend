/**
 * Recurrence as a rule: FREQ, BYDAY, COUNT or UNTIL.
 *
 * A rule expands to occurrences on demand; the chapter's page asks for a window, not for "all". The
 * subset is deliberately small — daily and weekly, with a day list — because the point is the wall clock
 * across a change, not the whole of RFC 5545.
 */

import { addDays, wallToInstant, type Wall, type Zone } from "./time.ts";

export type Freq = "DAILY" | "WEEKLY";

export type Rule = {
  readonly freq: Freq;
  /** ISO weekday numbers, 1 = Monday .. 7 = Sunday. Empty means the start's weekday. */
  readonly byDay: readonly number[];
  readonly count?: number;
  /** Epoch milliseconds; occurrences at or after it are not included. */
  readonly until?: number;
};

const DAYS: Readonly<Record<string, number>> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

export function parseRule(text: string): Rule {
  if (!text.startsWith("FREQ=")) throw new Error(`rrule: ${text} does not start with FREQ`);
  const fields = new Map<string, string>();
  for (const part of text.split(";")) {
    const [key, value] = part.split("=");
    if (!key || value === undefined) throw new Error(`rrule: ${part} is not KEY=VALUE`);
    fields.set(key, value);
  }

  const freq = fields.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY") throw new Error(`rrule: FREQ ${String(freq)} is not supported`);

  const byDay = (fields.get("BYDAY") ?? "")
    .split(",")
    .filter(Boolean)
    .map((day) => {
      const value = DAYS[day];
      if (value === undefined) throw new Error(`rrule: BYDAY ${day} is not a weekday`);
      return value;
    });

  const countText = fields.get("COUNT");
  const count = countText === undefined ? undefined : Number(countText);
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) throw new Error(`rrule: COUNT ${countText} is not a count`);

  const untilText = fields.get("UNTIL");
  // iCalendar writes UNTIL as 20260101T000000Z, not as ISO; Date.parse does not read it.
  const until = untilText === undefined ? undefined : parseUntil(untilText, fields.get("UNTIL") ?? "");

  if (count !== undefined && until !== undefined) throw new Error("rrule: COUNT and UNTIL are exclusive");
  return { freq, byDay, ...(count === undefined ? {} : { count }), ...(until === undefined ? {} : { until }) };
}

function parseUntil(text: string, original: string): number {
  const basic = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(text);
  if (basic) {
    return Date.UTC(Number(basic[1]), Number(basic[2]) - 1, Number(basic[3]), Number(basic[4]), Number(basic[5]), Number(basic[6]));
  }
  const iso = Date.parse(text);
  if (Number.isNaN(iso)) throw new Error(`rrule: UNTIL ${original} is not a date`);
  return iso;
}

export function describeRule(rule: Rule): string {
  const days = rule.byDay.map((day) => Object.keys(DAYS).find((key) => DAYS[key] === day)).join(",");
  const end = rule.count !== undefined ? ` x${rule.count}` : rule.until !== undefined ? ` until ${new Date(rule.until).toISOString().slice(0, 10)}` : "";
  return `${rule.freq.toLowerCase()}${days ? ` on ${days}` : ""}${end}`;
}

export type Occurrence = {
  readonly wall: Wall;
  readonly instant: Date;
};

/** The weekday of a wall date, 1 = Monday. */
function weekday(wall: Wall): number {
  const day = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Expands a rule from a start wall time, keeping the clock reading.
 *
 * The expansion walks dates on the wall calendar and converts each to an instant on demand, which is
 * why a 09:00 meeting stays at 09:00 when the offset changes underneath it.
 */
export function expand(zone: Zone, start: Wall, rule: Rule, limit = 400): Occurrence[] {
  if (limit < 1) throw new Error(`expand: limit ${limit} is not a count`);
  const days = rule.byDay.length > 0 ? new Set(rule.byDay) : new Set([weekday(start)]);
  const occurrences: Occurrence[] = [];
  let wall = start;

  for (let guard = 0; guard < 100_000 && occurrences.length < (rule.count ?? limit); guard += 1) {
    if (days.has(weekday(wall))) {
      const instant = wallToInstant(zone, wall);
      if (rule.until === undefined || instant.getTime() < rule.until) occurrences.push({ wall, instant });
      if (rule.until !== undefined && instant.getTime() >= rule.until) break;
    }
    wall = addDays(zone, wall, 1);
    if (rule.count === undefined && occurrences.length >= limit) break;
  }

  return occurrences;
}
