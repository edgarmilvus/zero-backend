/**
 * The calendar: events, a merge by UID and sequence, and the occurrences in a window.
 *
 * A calendar is not a list of appointments; it is a list of promises. The promise is the rule and the
 * wall clock, and the occurrences are computed for the window a page is showing.
 */

import { expand, type Occurrence, type Rule } from "./recur.ts";
import { wallToInstant, type Wall, type Zone } from "./time.ts";

export type Event = {
  readonly uid: string;
  readonly summary: string;
  readonly zone: Zone;
  readonly start: Wall;
  readonly durationMinutes: number;
  readonly rule?: string;
  readonly sequence: number;
  readonly updatedAt: number;
};

export type Calendar = { readonly events: readonly Event[] };

export function mergeCalendars(local: Calendar, incoming: Calendar): { calendar: Calendar; added: number; conflicts: number } {
  const byUid = new Map<string, Event>();
  for (const event of local.events) byUid.set(event.uid, event);

  let added = 0;
  let conflicts = 0;
  for (const event of incoming.events) {
    const mine = byUid.get(event.uid);
    if (!mine) {
      byUid.set(event.uid, event);
      added += 1;
      continue;
    }
    const newer = event.sequence > mine.sequence || (event.sequence === mine.sequence && event.updatedAt > mine.updatedAt);
    if (newer) {
      byUid.set(event.uid, event);
      conflicts += 1;
    } else if (event.sequence < mine.sequence) {
      conflicts += 1;
    }
  }

  return { calendar: { events: [...byUid.values()] }, added, conflicts };
}

export type Window = { readonly from: Date; readonly to: Date };

/** Occurrences in a window, with the event each came from. */
export function occurrencesBetween(calendar: Calendar, window: Window, limit = 200): { event: Event; occurrence: Occurrence }[] {
  const out: { event: Event; occurrence: Occurrence }[] = [];
  for (const event of calendar.events) {
    if (event.rule) {
      const rule = parseRuleText(event.rule);
      for (const occurrence of expand(event.zone, event.start, rule, limit)) {
        const ends = occurrence.instant.getTime() + event.durationMinutes * 60_000;
        if (ends > window.from.getTime() && occurrence.instant.getTime() < window.to.getTime()) out.push({ event, occurrence });
      }
    } else {
      const instant = wallToInstant(event.zone, event.start);
      const ends = instant.getTime() + event.durationMinutes * 60_000;
      if (ends > window.from.getTime() && instant.getTime() < window.to.getTime()) out.push({ event, occurrence: { wall: event.start, instant } });
    }
  }
  return out.sort((left, right) => left.occurrence.instant.getTime() - right.occurrence.instant.getTime());
}

import { parseRule } from "./recur.ts";

function parseRuleText(text: string): Rule {
  return parseRule(text);
}
