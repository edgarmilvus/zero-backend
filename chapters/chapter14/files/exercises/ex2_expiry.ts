/**
 * Exercise 2 - the capability that never expired.
 *
 * An expiry stored as a local date string is not comparable across devices, is not the number the
 * signature covers, and a user who changes the clock extends the grant. The epoch is the repair.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Grant = { readonly expiresAt: number | string };

/** The bug: a local date string compared lexicographically with the current time. */
export function expiredByString(grant: Grant, now: number): boolean {
  return new Date(grant.expiresAt as string).toString() < new Date(now).toString();
}

/** The repair: epoch milliseconds, compared as numbers, with the edge defined. */
export function expiredByEpoch(grant: Grant, now: number): boolean {
  if (typeof grant.expiresAt !== "number" || !Number.isFinite(grant.expiresAt)) {
    throw new Error("expiry: expected epoch milliseconds");
  }
  return now >= grant.expiresAt;
}

export function remainingMs(grant: Grant, now: number): number {
  if (typeof grant.expiresAt !== "number") throw new Error("expiry: expected epoch milliseconds");
  return Math.max(0, grant.expiresAt - now);
}

const NOW = 1_700_000_000_000;

export const checks: readonly Check[] = [
  { name: "an epoch in the future has not expired", run: () => eq(expiredByEpoch({ expiresAt: NOW + 1000 }, NOW), false, "expired") },
  { name: "one in the past has", run: () => eq(expiredByEpoch({ expiresAt: NOW - 1 }, NOW), true, "expired") },
  { name: "the exact instant is expired", run: () => eq(expiredByEpoch({ expiresAt: NOW }, NOW), true, "edge") },
  { name: "one millisecond before is not", run: () => eq(expiredByEpoch({ expiresAt: NOW + 1 }, NOW), false, "edge") },
  { name: "a date string is refused instead of coerced", run: () => {
    const error = throws(() => expiredByEpoch({ expiresAt: "2030-01-01" }, NOW), "string");
    return expect(error.message.includes("epoch"), error.message);
  } },
  { name: "the string comparison calls an expired grant valid", run: () => {
    // The grant expired on 2 January 2030 and the clock says 1 June 2030. Epoch arithmetic is
    // unambiguous; the toString comparison sees "Wed ..." against "Sat ..." and says not expired.
    const now = Date.parse("2030-06-01T00:00:00Z");
    const byString = expiredByString({ expiresAt: "01/02/2030" }, now);
    const byEpoch = now >= Date.parse("2030-01-02T00:00:00Z");
    return expect(byString === false && byEpoch === true, `string ${byString}, epoch ${byEpoch}`);
  } },
  { name: "remaining time is never negative", run: () => eq(remainingMs({ expiresAt: NOW - 5_000 }, NOW), 0, "remaining") },
  { name: "remaining time is the difference", run: () => eq(remainingMs({ expiresAt: NOW + 5_000 }, NOW), 5_000, "remaining") },
  { name: "a non-numeric expiry is refused in the remaining calculation too", run: () => {
    const error = throws(() => remainingMs({ expiresAt: "soon" }, NOW), "string");
    return expect(error.message.includes("epoch"), error.message);
  } },
];

export function main(): number {
  console.log(`epoch             +1s expired at now -> ${expiredByEpoch({ expiresAt: NOW + 1000 }, NOW)}`);
  console.log(`string            "01/02/2030" at 2026-12-31 -> ${expiredByString({ expiresAt: "01/02/2030" }, Date.parse("2026-12-31T00:00:00Z"))}`);
  console.log("");
  console.log("a date is a format; an instant is a number");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
