/**
 * Exercise 2 - a second workload: the four-thousand-photo batch.
 *
 * The reel is one item and one job. A photo batch is four thousand items and one
 * job, and the two numbers stop being comparable the moment the operation
 * changes: a thousand batches is four million photos, and a thousand reels is a
 * thousand reels. The ledger keeps printing a per-thousand figure, so the
 * exercise is to say per thousand *what*.
 *
 * What grows with the fan-out is not the bill. It is the clock.
 */

import { BYTES, TARIFF_2026_11 } from "../tariff.ts";
import { formatRow, priceServer, serverLatencyMs, serverRow, type Workload } from "../ledger.ts";
import { REEL } from "../reel.ts";
import { expect, near, type Check } from "./selfcheck.ts";

export const PHOTO_BATCH: Workload = {
  id: "photo-batch-4000",
  label: "4000 HEIC photos: resize to 1600px WebP, strip EXIF",
  items: 4000,
  requestsPerItem: 2,
  uploadBytes: 3 * BYTES.MB,
  egressBytes: 400 * BYTES.KB,
  workerMb: 512,
  workerSeconds: 0.4,
  concurrency: 8,
  storageGbMonths: 0.4,
  loses: [
    "12 GB of originals held in the bucket for the month",
    "no progressive preview until the batch finishes",
  ],
  refusal: null,
};

/** The honest comparison: cost per thousand items, not per thousand jobs. */
export function perThousandItems(workload: Workload): number {
  const { totalUsd } = priceServer(workload, TARIFF_2026_11);
  return (totalUsd / workload.items) * 1000;
}

const batch = priceServer(PHOTO_BATCH, TARIFF_2026_11);
const reel = priceServer(REEL, TARIFF_2026_11);

export const checks: readonly Check[] = [
  {
    name: "one batch costs more than one reel",
    run: () => expect(batch.totalUsd > reel.totalUsd, "batch should cost more per job"),
  },
  {
    name: "one photo costs less than one reel",
    run: () => {
      const perPhoto = batch.totalUsd / PHOTO_BATCH.items;
      return expect(perPhoto < reel.totalUsd, `${perPhoto} vs ${reel.totalUsd}`);
    },
  },
  {
    name: "egress still holds most of the bill",
    run: () => expect(batch.egressUsd / batch.totalUsd > 0.8, "egress share"),
  },
  {
    name: "requests grow four thousandfold",
    run: () =>
      near(
        batch.requestsUsd / reel.requestsUsd,
        PHOTO_BATCH.items,
        1e-6,
        "request ratio",
      ),
  },
  {
    name: "and are still under one percent of the bill",
    run: () => expect(batch.requestsUsd / batch.totalUsd < 0.01, "requests are noise"),
  },
  {
    name: "sequentially, the batch takes over twenty minutes",
    run: () => {
      const serial = serverLatencyMs({ ...PHOTO_BATCH, concurrency: 1 });
      return expect(serial > 20 * 60 * 1000, `got ${serial} ms`);
    },
  },
  {
    name: "eight at a time divides the work term by eight",
    run: () => {
      const serial = serverLatencyMs({ ...PHOTO_BATCH, concurrency: 1 });
      const parallel = serverLatencyMs({ ...PHOTO_BATCH, concurrency: 8 });
      const work = PHOTO_BATCH.workerSeconds * PHOTO_BATCH.items * 1000;
      return near(serial - parallel, work - work / 8, 1e-9, "saved time");
    },
  },
  {
    name: "concurrency does not change the price",
    run: () =>
      near(
        priceServer({ ...PHOTO_BATCH, concurrency: 1 }, TARIFF_2026_11).totalUsd,
        batch.totalUsd,
        1e-12,
        "total",
      ),
  },
  {
    name: "per thousand items, the batch is the cheaper operation",
    run: () =>
      expect(
        perThousandItems(PHOTO_BATCH) < perThousandItems(REEL),
        `${perThousandItems(PHOTO_BATCH)} vs ${perThousandItems(REEL)}`,
      ),
  },
];

export function main(): number {
  console.log(`batch per job         ${batch.totalUsd.toFixed(4)} USD`);
  console.log(`reel per job          ${reel.totalUsd.toFixed(4)} USD`);
  console.log(`batch per 1,000 jobs  ${(batch.totalUsd * 1000).toFixed(2)} USD`);
  console.log(`batch per 1,000 items ${perThousandItems(PHOTO_BATCH).toFixed(4)} USD`);
  console.log(`reel per 1,000 items  ${perThousandItems(REEL).toFixed(4)} USD`);
  console.log("");
  console.log(`serial latency        ${(serverLatencyMs({ ...PHOTO_BATCH, concurrency: 1 }) / 1000).toFixed(0)} s`);
  console.log(`eight at a time       ${(serverLatencyMs(PHOTO_BATCH) / 1000).toFixed(0)} s`);
  console.log(`requests              ${batch.requestsUsd.toFixed(6)} USD of ${batch.totalUsd.toFixed(4)}`);
  console.log("");
  console.log(formatRow(serverRow(PHOTO_BATCH, TARIFF_2026_11)));
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
