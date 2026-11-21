/**
 * Two clocks: the wall time a person reads and the instant the machine stores.
 *
 * `offsetMinutes` asks the runtime's zone database what the offset was at an instant; `wallToInstant`
 * goes the other way, twice, because the offset depends on the instant it is trying to find.
 */

export type Zone = string;

export type Wall = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
};

const pad = (value: number): string => String(value).padStart(2, "0");

export function formatWall(wall: Wall): string {
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)} ${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** Minutes east of UTC for a zone at an instant, from the runtime's database. */
export function offsetMinutes(zone: Zone, at: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(at);
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour") % 24, value("minute"), value("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * The instant a wall time names in a zone.
 *
 * The first guess uses the offset at the naive UTC instant; the second corrects it with the offset at
 * the guess, which is what makes a time after a change land on the right side of it.
 */
export function wallToInstant(zone: Zone, wall: Wall): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  let instant = naive;
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = offsetMinutes(zone, new Date(instant));
    instant = naive - offset * 60_000;
  }
  return new Date(instant);
}

/** The wall time an instant shows in a zone. */
export function instantToWall(zone: Zone, at: Date): Wall {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(at);
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour") % 24,
    minute: value("minute"),
  };
}

/** A wall time plus days, keeping the clock reading and letting the instant move across a change. */
export function addDays(zone: Zone, wall: Wall, days: number): Wall {
  const at = wallToInstant(zone, wall);
  const shifted = new Date(at.getTime() + days * 86_400_000);
  void shifted;
  // The wall clock is what recurs: take the date arithmetic in UTC on the wall fields, not on the instant.
  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days, wall.hour, wall.minute));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}
