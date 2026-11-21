/**
 * The page: a month window across the change, and the .ics a user can mail.
 */

import { occurrencesBetween, type Calendar, type Event } from "../calendar.ts";
import { fromIcs, toIcs } from "../ics.ts";
import { formatWall, instantToWall, wallToInstant } from "../time.ts";

const ZONE = "Europe/Rome";

export const CALENDAR: Calendar = {
  events: [
    {
      uid: "standup@zero-backend",
      summary: "Standup, with a comma; and a semicolon",
      zone: ZONE,
      start: { year: 2026, month: 3, day: 25, hour: 9, minute: 0 },
      durationMinutes: 15,
      rule: "FREQ=WEEKLY;BYDAY=WE;COUNT=8",
      sequence: 1,
      updatedAt: 1_700_000_000_000,
    },
    {
      uid: "flight@zero-backend",
      summary: "Flight to Lisbon",
      zone: ZONE,
      start: { year: 2026, month: 4, day: 2, hour: 7, minute: 30 },
      durationMinutes: 150,
      sequence: 1,
      updatedAt: 1_700_000_000_000,
    },
  ],
};

export type Row = { readonly wall: string; readonly instant: string; readonly summary: string };
export type PageResult = { readonly rows: readonly Row[]; readonly icsBytes: number; readonly events: number };

export function run(): PageResult {
  const from = wallToInstant(ZONE, { year: 2026, month: 3, day: 20, hour: 0, minute: 0 });
  const to = wallToInstant(ZONE, { year: 2026, month: 4, day: 20, hour: 0, minute: 0 });
  const occurrences = occurrencesBetween(CALENDAR, { from, to });
  const ics = toIcs(CALENDAR.events, 1_700_000_000_000);

  return {
    rows: occurrences.map(({ event, occurrence }) => ({
      wall: formatWall(instantToWall(ZONE, occurrence.instant)),
      instant: occurrence.instant.toISOString().slice(0, 16) + "Z",
      summary: event.summary,
    })),
    icsBytes: new TextEncoder().encode(ics).byteLength,
    events: CALENDAR.events.length,
  };
}

declare global {
  interface Window {
    __run: () => PageResult;
    __import: (text: string) => number;
    __export: () => string;
  }
}

if (typeof window !== "undefined") {
  const body = document.querySelector<HTMLTableSectionElement>("#rows");
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");

  const render = (result: PageResult): void => {
    if (body) {
      body.innerHTML = result.rows
        .map((row) => `<tr><td>${row.wall}</td><td>${row.instant}</td><td>${row.summary}</td></tr>`)
        .join("");
    }
    if (status) status.textContent = `${result.rows.length} occurrences, ${result.icsBytes} bytes of .ics`;
  };

  document.querySelector("#run")?.addEventListener("click", () => {
    const result = run();
    render(result);
    if (output) output.textContent = result.rows.map((row) => `${row.wall}  ${row.instant}  ${row.summary}`).join("\n");
  });

  document.querySelector("#export")?.addEventListener("click", () => {
    const ics = toIcs(CALENDAR.events, 1_700_000_000_000);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    link.download = "calendar.ics";
    link.click();
    URL.revokeObjectURL(link.href);
    if (status) status.textContent = "exported calendar.ics";
  });

  document.querySelector("#import")?.addEventListener("click", () => {
    const text = document.querySelector<HTMLTextAreaElement>("#ics")?.value ?? "";
    try {
      const events = fromIcs(text);
      if (status) status.textContent = `imported ${events.length} event(s)`;
      if (output) output.textContent = events.map((event) => `${event.uid}  ${event.summary}  ${event.rule ?? "once"}`).join("\n");
    } catch (error) {
      if (status) status.textContent = `refused: ${(error as Error).message}`;
    }
  });

  window.__run = run;
  window.__export = () => toIcs(CALENDAR.events, 1_700_000_000_000);
  window.__import = (text: string) => fromIcs(text).length;
  document.querySelector("#run")?.dispatchEvent(new Event("click"));
}
