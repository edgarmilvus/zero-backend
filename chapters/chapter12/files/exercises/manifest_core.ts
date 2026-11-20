/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * Whether a load is worth it, in arithmetic: the bytes, the time, and the frame. No file, no worker,
 * no clock.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Load = {
  readonly bytes: number;
  readonly mbps: number;
  readonly dims: number;
};

export function downloadMs(load: Load): number {
  if (!(load.bytes >= 0)) throw new Error(`bytes: ${load.bytes} is not a size`);
  if (!(load.mbps > 0)) throw new Error(`mbps: ${load.mbps} is not a throughput`);
  // Megabits: a byte is eight bits, and the link is sold in the smaller unit.
  return ((load.bytes * 8) / (load.mbps * 1_000_000)) * 1000;
}

/** A frame gap longer than a hundred milliseconds is a freeze a person notices. */
export const NOTICEABLE_MS = 100;

export function isNoticeable(maxGapMs: number): boolean {
  if (!(maxGapMs >= 0)) throw new Error(`gap: ${maxGapMs} is not a duration`);
  return maxGapMs >= NOTICEABLE_MS;
}

/** Which thread the work ran on, and whether the page kept painting. */
export function verdict(mode: "worker" | "main", maxGapMs: number): string {
  if (mode === "worker") return isNoticeable(maxGapMs) ? "worker but the page stalled" : "smooth";
  return isNoticeable(maxGapMs) ? "frozen" : "main thread, and it survived";
}

export const checks: readonly Check[] = [
  { name: "a download of 23 MB at 10 Mbps is 18 seconds", run: () => eq(Math.round(downloadMs({ bytes: 23_684_681, mbps: 10, dims: 384 })), 18_948, "ms") },
  { name: "a zero throughput is refused", run: () => {
    const error = throws(() => downloadMs({ bytes: 1, mbps: 0, dims: 384 }), "zero");
    return expect(error.message.includes("throughput"), error.message);
  } },
  { name: "a hundred milliseconds is the threshold of noticeable", run: () => eq(isNoticeable(100), true, "100") },
  { name: "a worker under the threshold is smooth", run: () => eq(verdict("worker", 16.7), "smooth", "verdict") },
  { name: "a main thread over the threshold is frozen", run: () => eq(verdict("main", 614), "frozen", "verdict") },
];
