/**
 * The desk: one job this chapter prices.
 *
 * A 120 MB phone reel comes in. The product's promise is unchanged on both paths:
 * the user gets the reel back, with a thumbnail, a checksum and its duration. The
 * difference is where the bytes go, and that is the only thing the ledger prices.
 *
 * The workload carries no client measurement. A measurement is what the run
 * produces, and `withMeasurement` is the only way to attach one.
 */

import type { ClientMeasurement, Workload } from "./ledger.ts";
import { BYTES } from "./tariff.ts";

export const REEL: Workload = {
  id: "reel-120mb",
  label: "one 120 MB phone reel: thumbnail, duration, checksum",
  items: 1,
  requestsPerItem: 2, // PUT the original, POST the job
  uploadBytes: 120 * BYTES.MB,
  egressBytes: 120 * BYTES.MB, // the processed reel comes back
  workerMb: 1024,
  workerSeconds: 4,
  concurrency: 1,
  storageGbMonths: 0.12,
  loses: [
    "4 GB address space per worker",
    "single-threaded decode on iOS below 17",
    "no ffmpeg filters that need a second pass",
  ],
  refusal: null,
};

/** The same document, with the number the run produced. */
export function withMeasurement(
  workload: Workload,
  measurement: ClientMeasurement,
): Workload {
  return { ...workload, client: measurement };
}

/** The same document, refused, with the reason the ledger will print. */
export function refused(
  workload: Workload,
  refusal: NonNullable<Workload["refusal"]>,
): Workload {
  return {
    ...workload,
    refusal,
    client: {
      wallClockMs: Number.POSITIVE_INFINITY,
      peakHeapBytes: 0,
      source: "refused",
      record: null,
    },
  };
}
