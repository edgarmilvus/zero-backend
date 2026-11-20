/**
 * Exercise 4 - the file that is bigger than the quota.
 *
 * A 4 GB export and an origin that may store 2 GB. The naive writer starts, fills the quota at
 * 60 per cent, and leaves a truncated file and a user who has lost an export. The correct
 * answer is a refusal with three parts, before the first byte.
 */

import { QuotaExceeded } from "../storage.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

export const EXPORT_BYTES = 4 * 1e9;
export const ORIGIN_QUOTA_BYTES = 2 * 1e9;

export type Decision = "write" | "refuse";

export type Refusal = {
  readonly reason: string;
  readonly ceiling: string;
  readonly fallbackChapter: number;
};

/** The naive writer: it tries, and the platform decides when to stop. */
export function attemptsToWrite(exportBytes: number, quotaBytes: number, chunkBytes: number): number {
  let written = 0;
  while (written + chunkBytes <= exportBytes) {
    if (written + chunkBytes > quotaBytes) return written;
    written += chunkBytes;
  }
  return written;
}

/** The repair: compare the two numbers before touching the disk. */
export function decide(exportBytes: number, quotaBytes: number): Decision {
  return exportBytes > quotaBytes ? "refuse" : "write";
}

export function refusal(exportBytes: number, quotaBytes: number): Refusal | null {
  if (decide(exportBytes, quotaBytes) === "write") return null;
  return {
    reason: `the export is ${(exportBytes / 1e9).toFixed(1)} GB and this origin may store ${(
      quotaBytes / 1e9
    ).toFixed(1)} GB`,
    ceiling: "the storage quota of the origin, which the user can see and the app cannot raise",
    fallbackChapter: 3,
  };
}

export const checks: readonly Check[] = [
  {
    name: "the naive writer stops at the quota, not at the file",
    run: () => eq(attemptsToWrite(EXPORT_BYTES, ORIGIN_QUOTA_BYTES, 100 * 1e6), 2e9, "bytes"),
  },
  {
    name: "and the file it leaves is truncated",
    run: () => expect(attemptsToWrite(EXPORT_BYTES, ORIGIN_QUOTA_BYTES, 100 * 1e6) < EXPORT_BYTES, "truncated"),
  },
  {
    name: "the decision is refuse for this pair",
    run: () => eq(decide(EXPORT_BYTES, ORIGIN_QUOTA_BYTES), "refuse", "decision"),
  },
  {
    name: "a file that fits is written",
    run: () => eq(decide(1e9, ORIGIN_QUOTA_BYTES), "write", "decision"),
  },
  {
    name: "the refusal names the size",
    run: () => expect(refusal(EXPORT_BYTES, ORIGIN_QUOTA_BYTES)?.reason.includes("4.0 GB") === true, "reason"),
  },
  {
    name: "the refusal names the ceiling",
    run: () => expect(refusal(EXPORT_BYTES, ORIGIN_QUOTA_BYTES)?.ceiling.includes("quota") === true, "ceiling"),
  },
  {
    name: "the refusal points at the chapter that handles the fallback",
    run: () => eq(refusal(EXPORT_BYTES, ORIGIN_QUOTA_BYTES)?.fallbackChapter, 3, "chapter"),
  },
  {
    name: "a file that fits has no refusal",
    run: () => eq(refusal(1e9, ORIGIN_QUOTA_BYTES), null, "no refusal"),
  },
  {
    name: "the naive writer's number is a multiple of the chunk",
    run: () => {
      const written = attemptsToWrite(EXPORT_BYTES, ORIGIN_QUOTA_BYTES, 100 * 1e6);
      return eq(written % (100 * 1e6), 0, "remainder");
    },
  },
];

export async function main(): Promise<number> {
  console.log(`export            ${(EXPORT_BYTES / 1e9).toFixed(1)} GB`);
  console.log(`origin quota      ${(ORIGIN_QUOTA_BYTES / 1e9).toFixed(1)} GB`);
  console.log(`naive stop        ${(attemptsToWrite(EXPORT_BYTES, ORIGIN_QUOTA_BYTES, 100e6) / 1e9).toFixed(1)} GB written`);
  console.log(`decision          ${decide(EXPORT_BYTES, ORIGIN_QUOTA_BYTES)}`);
  const why = refusal(EXPORT_BYTES, ORIGIN_QUOTA_BYTES);
  if (why) {
    console.log(`reason            ${why.reason}`);
    console.log(`ceiling           ${why.ceiling}`);
    console.log(`fallback          chapter ${why.fallbackChapter}, the file system access path`);
  }
  console.log("");
  console.log(`a refusal that arrives before the first byte costs a message; one at 60 per cent costs the export`);
  console.log(`and ${QuotaExceeded.name} is what the store throws when the budget is not checked first`);
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
