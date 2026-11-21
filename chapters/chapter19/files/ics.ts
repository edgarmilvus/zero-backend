/**
 * iCalendar: the text format other apps read.
 *
 * Two rules make it work and both are easy to get wrong. Lines fold at 75 octets, not characters, and a
 * continuation begins with a space. Text values escape backslash, semicolon, comma and newline, because
 * the comma separates list items and the semicolon separates parameters.
 */

import type { Wall, Zone } from "./time.ts";
import type { Event } from "./calendar.ts";

const encoder = new TextEncoder();

export function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function unescapeText(text: string): string {
  return text.replace(/\\([\\;,nN])/g, (_match, character: string) => (character === "n" || character === "N" ? "\n" : character));
}

/** Folds a line at 75 octets without splitting a multi-byte character. */
export function fold(line: string): string {
  const bytes = encoder.encode(line);
  if (bytes.byteLength <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).byteLength;
    if (currentBytes + size > 75) {
      out.push(current);
      current = character;
      currentBytes = size;
    } else {
      current += character;
      currentBytes += size;
    }
  }
  if (current !== "") out.push(current);
  return out.join("\r\n ");
}

export function unfold(text: string): string {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

const pad = (value: number): string => String(value).padStart(2, "0");

export function formatLocal(wall: Wall): string {
  return `${wall.year}${pad(wall.month)}${pad(wall.day)}T${pad(wall.hour)}${pad(wall.minute)}00`;
}

export function parseLocal(text: string): Wall {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(text);
  if (!match) throw new Error(`ics: ${text} is not a local date-time`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

export function toIcs(events: readonly Event[], now = Date.now()): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zero Backend//Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;TZID=${event.zone}:${formatLocal(event.start)}`);
    lines.push(`DURATION:PT${event.durationMinutes}M`);
    if (event.rule) lines.push(`RRULE:${event.rule}`);
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    lines.push(`SEQUENCE:${event.sequence}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function fromIcs(text: string): Event[] {
  const lines = unfold(text).split(/\r?\n/);
  const events: Event[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(buildEvent(current));
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 0) throw new Error(`ics: ${line} has no value`);
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    current[left.split(";")[0] ?? left] = left.includes(";TZID=") ? `${left.split(";TZID=")[1]!.split(";")[0]}|${value}` : value;
  }

  return events;
}

function buildEvent(fields: Record<string, string>): Event {
  const uid = fields.UID;
  const summary = fields.SUMMARY;
  const start = fields.DTSTART;
  if (!uid) throw new Error("ics: VEVENT without UID");
  if (summary === undefined) throw new Error(`ics: ${uid} without SUMMARY`);
  if (!start) throw new Error(`ics: ${uid} without DTSTART`);

  const [zone, local] = start.includes("|") ? (start.split("|") as [string, string]) : ["UTC", start];
  const duration = /^PT(\d+)M$/.exec(fields.DURATION ?? "PT60M");
  return {
    uid,
    summary: unescapeText(summary),
    zone: zone as Zone,
    start: parseLocal(local),
    durationMinutes: duration ? Number(duration[1]) : 60,
    ...(fields.RRULE === undefined ? {} : { rule: fields.RRULE }),
    sequence: Number(fields.SEQUENCE ?? 0),
    updatedAt: Date.parse(fields.DTSTAMP ?? "") || 0,
  };
}
