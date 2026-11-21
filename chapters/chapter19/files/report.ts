/**
 * What the chapter prints, and the two assertions a calendar test needs.
 */

import type { Event } from "./calendar.ts";
import type { Occurrence } from "./recur.ts";
import { formatWall, instantToWall } from "./time.ts";

export function renderEvent(event: Event): string {
  return [
    `uid               ${event.uid}`,
    `summary           ${event.summary}`,
    `start             ${formatWall(event.start)} (${event.zone})`,
    `duration          ${event.durationMinutes} min`,
    `rule              ${event.rule ?? "none"}`,
    `sequence          ${event.sequence}`,
  ].join("\n");
}

export function renderOccurrence(occurrence: Occurrence, zone: string): string {
  const wall = instantToWall(zone, occurrence.instant);
  return `  ${formatWall(wall)}  ${occurrence.instant.toISOString()}`;
}

/** The promise: the wall time is the same, whatever the instant does. */
export function assertWall(occurrences: readonly Occurrence[], zone: string, hour: number, minute: number): void {
  for (const occurrence of occurrences) {
    const wall = instantToWall(zone, occurrence.instant);
    if (wall.hour !== hour || wall.minute !== minute) {
      throw new Error(`occurrence at ${formatWall(wall)} is not ${hour}:${String(minute).padStart(2, "0")}`);
    }
  }
}

export function assertBytes(bytes: number, budget: number): void {
  if (bytes > budget) throw new Error(`file: ${bytes} bytes against a ${budget}-byte budget`);
}
