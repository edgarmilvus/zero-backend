/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * Versions as values: what the database has, what the code wants, and which step comes next. No
 * connection, no SQL, no I/O.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Version = {
  readonly current: number;
  readonly target: number;
};

export function newVersion(current: number, target: number): Version {
  if (!Number.isInteger(current) || current < 0) throw new Error(`current: ${current} is not a version`);
  if (!Number.isInteger(target) || target < 0) throw new Error(`target: ${target} is not a version`);
  return { current, target };
}

/** The version after applying everything pending: the target, or a refusal. */
export function bump(version: Version): number {
  if (version.current > version.target) {
    throw new Error(
      `the database is at ${version.current} and this build knows ${version.target}: a later version wrote it`,
    );
  }
  return version.target;
}

export function isAfter(left: number, right: number): boolean {
  return left > right;
}

export function pending(version: Version): number[] {
  if (version.current > version.target) return [];
  return Array.from({ length: version.target - version.current }, (_, index) => version.current + index + 1);
}

// --- the tests this file owns -------------------------------------------------

export const checks: readonly Check[] = [
  {
    name: "a new version keeps both numbers",
    run: () => eq(newVersion(1, 3).target, 3, "target"),
  },
  {
    name: "bumping a fresh database lands on the target",
    run: () => eq(bump(newVersion(0, 3)), 3, "version"),
  },
  {
    name: "bumping an up-to-date one is a no-op",
    run: () => eq(bump(newVersion(3, 3)), 3, "version"),
  },
  {
    name: "a database from a newer build is refused by name",
    run: () => {
      try {
        bump(newVersion(4, 3));
        return false;
      } catch (error) {
        return expect((error as Error).message.includes("later version"), "message");
      }
    },
  },
  {
    name: "the pending steps are the ones in between",
    run: () => eq(pending(newVersion(1, 3)).join(","), "2,3", "pending"),
  },
];
