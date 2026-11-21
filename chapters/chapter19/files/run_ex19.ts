/**
 * Chapter 19 harness: 56 assertions over the wall clock, the rule, the file and the merge.
 *
 * The zone database is the runtime's, which is why the DST tests use Europe/Rome in 2026: a real rule,
 * a real change, and an instant that moves while the appointment does not.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { addDays, formatWall, instantToWall, offsetMinutes, wallToInstant, type Wall } from "./time.ts";
import { describeRule, expand, parseRule } from "./recur.ts";
import { escapeText, fold, formatLocal, fromIcs, parseLocal, toIcs, unescapeText, unfold } from "./ics.ts";
import { mergeCalendars, occurrencesBetween, type Calendar, type Event } from "./calendar.ts";
import { assertBytes, assertWall, renderEvent, renderOccurrence } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ZONE = "Europe/Rome";
const START: Wall = { year: 2026, month: 3, day: 25, hour: 9, minute: 0 };

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };
const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => void checks.push({ name, run });

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}
function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  return true;
}
function throwsSync(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

const EVENT: Event = {
  uid: "e1",
  summary: "Standup, with a comma; and a semicolon",
  zone: ZONE,
  start: START,
  durationMinutes: 15,
  rule: "FREQ=WEEKLY;BYDAY=WE;COUNT=5",
  sequence: 1,
  updatedAt: 1_700_000_000_000,
};

// --- the wall clock -----------------------------------------------------------

check("Rome is an hour ahead in March", () => eq(offsetMinutes(ZONE, new Date("2026-03-01T12:00:00Z")), 60, "offset"));
check("Rome is two hours ahead in April", () => eq(offsetMinutes(ZONE, new Date("2026-04-01T12:00:00Z")), 120, "offset"));
check("a wall time before the change maps to 08:00Z", () =>
  eq(wallToInstant(ZONE, START).toISOString(), "2026-03-25T08:00:00.000Z", "instant"),
);
check("a week later it maps to 07:00Z", () =>
  eq(wallToInstant(ZONE, addDays(ZONE, START, 7)).toISOString(), "2026-04-01T07:00:00.000Z", "instant"),
);
check("the wall clock is unchanged by the change", () => {
  const wall = addDays(ZONE, START, 7);
  return eq(formatWall(wall), "2026-04-01 09:00", "wall");
});
check("an instant reads back as the wall time it came from", () => {
  const instant = wallToInstant(ZONE, START);
  return eq(formatWall(instantToWall(ZONE, instant)), "2026-03-25 09:00", "round trip");
});
check("addDays keeps the clock reading across the change", () => eq(addDays(ZONE, START, 7).hour, 9, "hour"));
check("UTC has no offset", () => eq(offsetMinutes("UTC", new Date("2026-06-01T00:00:00Z")), 0, "offset"));
check("a month boundary rolls over", () => {
  const next = addDays(ZONE, { year: 2026, month: 3, day: 31, hour: 9, minute: 0 }, 1);
  return eq(`${next.month}-${next.day}`, "4-1", "date");
});
check("formatWall pads the fields", () => eq(formatWall({ year: 2026, month: 3, day: 5, hour: 9, minute: 7 }), "2026-03-05 09:07", "format"));
check("UTC maps a wall time to itself", () =>
  eq(wallToInstant("UTC", { year: 2026, month: 5, day: 1, hour: 12, minute: 0 }).toISOString(), "2026-05-01T12:00:00.000Z", "utc"),
);
check("New York is four hours behind in June", () =>
  eq(offsetMinutes("America/New_York", new Date("2026-06-01T12:00:00Z")), -240, "offset"),
);
check("a leap day exists in 2028", () => {
  const next = addDays("UTC", { year: 2028, month: 2, day: 28, hour: 9, minute: 0 }, 1);
  return eq(`${next.month}-${next.day}`, "2-29", "date");
});

// --- the rule -----------------------------------------------------------------

check("a weekly rule parses its days", () => eq(parseRule("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4").byDay.join(","), "1,3", "days"));
check("COUNT and UNTIL are exclusive", () => {
  const error = throwsSync(() => parseRule("FREQ=DAILY;COUNT=2;UNTIL=20260101T000000Z"), "both");
  return expect(error.message.includes("exclusive"), error.message);
});
check("an unsupported frequency is refused", () => {
  const error = throwsSync(() => parseRule("FREQ=MONTHLY"), "monthly");
  return expect(error.message.includes("not supported"), error.message);
});
check("a bad weekday is refused", () => {
  const error = throwsSync(() => parseRule("FREQ=WEEKLY;BYDAY=XX"), "weekday");
  return expect(error.message.includes("weekday"), error.message);
});
check("a rule without FREQ is refused", () => {
  const error = throwsSync(() => parseRule("BYDAY=MO"), "no freq");
  return expect(error.message.includes("FREQ"), error.message);
});
check("a count expands to that many occurrences", () =>
  eq(expand(ZONE, START, { freq: "WEEKLY", byDay: [3], count: 5 }).length, 5, "count"),
);
check("every occurrence is at nine", () => {
  assertWall(expand(ZONE, START, { freq: "WEEKLY", byDay: [3], count: 5 }), ZONE, 9, 0);
  return true;
});
check("the instants move by an hour across the change", () => {
  const [first, second] = expand(ZONE, START, { freq: "WEEKLY", byDay: [3], count: 2 });
  return eq((second!.instant.getTime() - first!.instant.getTime()) / 3_600_000, 167, "hours");
});
check("a daily rule without a count stops at the limit", () =>
  eq(expand(ZONE, START, { freq: "DAILY", byDay: [] }, 10).length, 10, "limit"),
);
check("an UNTIL stops the expansion", () => {
  const until = wallToInstant(ZONE, addDays(ZONE, START, 8)).getTime();
  return expect(expand(ZONE, START, { freq: "DAILY", byDay: [], until }).length <= 9, "too many");
});
check("an UNTIL parses to an instant", () => {
  const rule = parseRule("FREQ=DAILY;UNTIL=20260101T000000Z");
  return eq(rule.until, Date.parse("2026-01-01T00:00:00Z"), "until");
});
check("a rule without an end describes itself without one", () =>
  eq(describeRule({ freq: "DAILY", byDay: [] }), "daily", "text"),
);
check("a by-day list expands to one occurrence per day", () =>
  eq(expand(ZONE, START, { freq: "WEEKLY", byDay: [1, 3, 5], count: 6 }).length, 6, "count"),
);
check("a rule describes itself", () => {
  const text = describeRule({ freq: "WEEKLY", byDay: [1, 3], count: 4 });
  return expect(text.includes("WE") && text.includes("x4"), text);
});
check("a zero limit is refused", () => {
  const error = throwsSync(() => expand(ZONE, START, { freq: "DAILY", byDay: [] }, 0), "limit");
  return expect(error.message.includes("count"), error.message);
});

// --- the file -----------------------------------------------------------------

check("text escaping covers the four characters", () =>
  eq(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne", "escaped"),
);
check("text unescaping restores them", () => eq(unescapeText("a\\,b\\;c\\\\d\\ne"), "a,b;c\\d\ne", "text"));
check("a short line is not folded", () => eq(fold("SUMMARY:short"), "SUMMARY:short", "fold"));
check("a long line is folded with a leading space", () => {
  const folded = fold(`SUMMARY:${"x".repeat(120)}`);
  return expect(folded.includes("\r\n "), "no fold");
});
check("folding is by octets and does not split an emoji", () => {
  const folded = fold(`SUMMARY:${"🎉".repeat(40)}`);
  for (const line of folded.split("\r\n")) {
    if (new TextEncoder().encode(line).byteLength > 75) return expect(false, "line over 75 octets");
  }
  return true;
});
check("unfolding restores the line", () => {
  const line = `SUMMARY:${"y".repeat(200)}`;
  return eq(unfold(fold(line)), line, "round trip");
});
check("a local date-time formats and parses", () => eq(formatLocal(START), "20260325T090000", "format"));
check("a malformed local date-time is refused", () => {
  const error = throwsSync(() => parseLocal("2026-03-25"), "bad");
  return expect(error.message.includes("local date-time"), error.message);
});
check("the file names the zone on DTSTART", () => {
  const text = toIcs([EVENT]);
  return expect(text.includes("DTSTART;TZID=Europe/Rome:"), text.split("\r\n").slice(0, 8).join("|"));
});
check("folding uses CRLF and a space", () => expect(fold(`X:${"z".repeat(100)}`).includes("\r\n "), "no CRLF fold"));
check("a calendar serialises to a VCALENDAR", () => {
  const text = toIcs([EVENT]);
  expect(text.startsWith("BEGIN:VCALENDAR"), "header");
  return expect(text.trimEnd().endsWith("END:VCALENDAR"), "footer");
});
check("an event round trips through the file", () => {
  const [back] = fromIcs(toIcs([EVENT]));
  if (!back) throw new Error("no event");
  eq(back.summary, EVENT.summary, "summary");
  eq(back.rule, EVENT.rule, "rule");
  return eq(back.sequence, EVENT.sequence, "sequence");
});
check("a VEVENT without a UID is refused", () => {
  const error = throwsSync(() => fromIcs("BEGIN:VEVENT\r\nSUMMARY:x\r\nEND:VEVENT"), "no uid");
  return expect(error.message.includes("UID"), error.message);
});

// --- the merge and the window -------------------------------------------------

check("a merge adds what is missing", () => {
  const other = { events: [{ ...EVENT, uid: "e2" }] };
  return eq(mergeCalendars({ events: [EVENT] }, other).added, 1, "added");
});
check("a higher sequence wins", () => {
  const moved = { ...EVENT, summary: "moved", sequence: 2, updatedAt: 1_800_000_000_000 };
  const merged = mergeCalendars({ events: [EVENT] }, { events: [moved] });
  return eq(merged.calendar.events[0]?.summary, "moved", "summary");
});
check("a lower sequence loses", () => {
  const older = { ...EVENT, summary: "older", sequence: 0 };
  const merged = mergeCalendars({ events: [EVENT] }, { events: [older] });
  return eq(merged.calendar.events[0]?.summary, EVENT.summary, "summary");
});
check("a lower-sequence conflict is counted", () => {
  const older = { ...EVENT, sequence: 0, updatedAt: 1 };
  return eq(mergeCalendars({ events: [EVENT] }, { events: [older] }).conflicts, 1, "conflicts");
});
check("the merge is idempotent", () => {
  const once = mergeCalendars({ events: [EVENT] }, { events: [EVENT] }).calendar;
  return eq(mergeCalendars(once, { events: [EVENT] }).added, 0, "added");
});
check("the window returns the occurrences inside it", () => {
  const calendar: Calendar = { events: [EVENT] };
  const from = wallToInstant(ZONE, START);
  const to = new Date(from.getTime() + 10 * 86_400_000);
  return eq(occurrencesBetween(calendar, { from, to }).length, 2, "occurrences");
});
check("an event outside the window is not returned", () => {
  const later: Event = { uid: "late", summary: "Later", zone: ZONE, start: { year: 2027, month: 1, day: 1, hour: 9, minute: 0 }, durationMinutes: 15, sequence: 1, updatedAt: 1 };
  const from = wallToInstant(ZONE, START);
  const to = new Date(from.getTime() + 10 * 86_400_000);
  return eq(occurrencesBetween({ events: [later] }, { from, to }).length, 0, "outside");
});
check("the window is sorted", () => {
  const calendar: Calendar = {
    events: [EVENT, { uid: "e2", summary: "Other", zone: ZONE, start: addDays(ZONE, START, 1), durationMinutes: 15, sequence: 1, updatedAt: 1 }],
  };
  const from = wallToInstant(ZONE, START);
  const to = new Date(from.getTime() + 10 * 86_400_000);
  const list = occurrencesBetween(calendar, { from, to });
  return eq(list.every((row, index) => index === 0 || row.occurrence.instant >= list[index - 1]!.occurrence.instant), true, "order");
});
check("the report refuses a moved wall time", () => {
  const error = throwsSync(() => assertWall(expand(ZONE, START, { freq: "DAILY", byDay: [] }, 1), ZONE, 10, 0), "wall");
  return expect(error.message.includes("not 10:00"), error.message);
});
check("the size assertion refuses an over-budget file", () => {
  const error = throwsSync(() => assertBytes(200, 100), "bytes");
  return expect(error.message.includes("budget"), error.message);
});

// --- the programs -------------------------------------------------------------

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("01 shows the instant moving and the wall staying", () => {
  const result = run("01_dst.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("-1 hour"), result.stdout);
});
check("02 expands five Wednesdays", () => {
  const result = run("02_expand.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("five Wednesdays"), result.stdout.slice(-80));
});
check("03 round trips a comma and a semicolon", () => {
  const result = run("03_roundtrip.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("round trip        true"), result.stdout);
});
check("04 merges by sequence", () => {
  const result = run("04_merge.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("standup at        9:30"), result.stdout);
});
check("05 imports a folded file and refuses two bad ones", () => {
  const result = run("05_import.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("2 malformed"), result.stdout.slice(-120));
});

// --- run ----------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
    return 1;
  }
  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }
  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
