/**
 * Exercise 1 - the tariff that counts egress twice.
 *
 * Two independent defects, and the bill is wrong by a factor of two thousand:
 *
 *   1. the egress price was entered per megabyte, not per gigabyte, so every
 *      job looks a thousand times more expensive;
 *   2. the bytes leaving the device are passed as the upload plus the download,
 *      and the download is charged twice.
 *
 * Neither defect throws. The number is plausible, the table renders, and the
 * slide says "the server is too expensive". The exercise is to find both, and to
 * leave behind a check that would have caught them.
 */

import { BYTES, TARIFF_2026_11, priceEgress, type Tariff } from "../tariff.ts";
import { priceServer, type Workload } from "../ledger.ts";
import { REEL } from "../reel.ts";
import { eq, near, type Check } from "./selfcheck.ts";

/** The tariff as it was entered: the same number, the wrong unit. */
export const PER_MEGABYTE: Tariff = {
  ...TARIFF_2026_11,
  id: "aws-us-east-1-2026-11 (as entered)",
  egressUsdPerGb: TARIFF_2026_11.egressUsdPerGb * 1000,
};

/** What the buggy ledger charges for the bytes that leave, on both legs. */
export function buggyEgress(tariff: Tariff, workload: Workload): number {
  const bothLegs = workload.uploadBytes * workload.items + workload.egressBytes * workload.items;
  return priceEgress(tariff, bothLegs);
}

/** What the bill should say: the bytes that come back, at today's unit price. */
export function repairedEgress(tariff: Tariff, workload: Workload): number {
  return priceEgress(tariff, workload.egressBytes * workload.items);
}

export type Defect = {
  readonly id: "unit" | "double-count";
  readonly what: string;
  readonly factor: number;
};

/** Both defects, named, with the factor each one contributes. */
export function findDefects(): readonly Defect[] {
  return [
    {
      id: "unit",
      what: "egress was priced per megabyte instead of per gigabyte",
      factor: 1000,
    },
    {
      id: "double-count",
      what: "the upload and the download were both charged as egress",
      factor: 2,
    },
  ];
}

const correctTotal = priceServer(REEL, TARIFF_2026_11).totalUsd;
const buggyTotal = priceServer(REEL, PER_MEGABYTE).totalUsd;

export const checks: readonly Check[] = [
  {
    name: "the repaired egress is the download, once",
    run: () => near(repairedEgress(TARIFF_2026_11, REEL), 0.0108, 1e-12, "egress"),
  },
  {
    name: "the entered tariff overcharges by a thousand",
    run: () =>
      near(
        priceEgress(PER_MEGABYTE, REEL.egressBytes) / priceEgress(TARIFF_2026_11, REEL.egressBytes),
        1000,
        1e-9,
        "unit factor",
      ),
  },
  {
    name: "charging both legs doubles the bytes",
    run: () =>
      near(
        buggyEgress(TARIFF_2026_11, REEL) / repairedEgress(TARIFF_2026_11, REEL),
        2,
        1e-12,
        "legs factor",
      ),
  },
  {
    name: "the two defects multiply to two thousand on the egress line",
    run: () =>
      near(
        buggyEgress(PER_MEGABYTE, REEL) / repairedEgress(TARIFF_2026_11, REEL),
        2000,
        1e-6,
        "egress factor",
      ),
  },
  {
    name: "the repaired bill is thirteen dollars sixty-three per thousand",
    run: () => near(correctTotal * 1000, 13.63, 0.005, "per thousand"),
  },
  {
    name: "the buggy bill puts egress above 99% of the total",
    run: () => {
      const breakdown = priceServer(REEL, PER_MEGABYTE);
      return near(breakdown.egressUsd / breakdown.totalUsd, 0.998, 0.002, "egress share");
    },
  },
  {
    name: "the repaired bill puts egress back under 85%",
    run: () => {
      const breakdown = priceServer(REEL, TARIFF_2026_11);
      return near(breakdown.egressUsd / breakdown.totalUsd, 0.793, 0.01, "egress share");
    },
  },
  {
    name: "the two defects are named, not guessed",
    run: () => {
      const defects = findDefects();
      eq(defects.length, 2, "defect count");
      return eq(defects.map((d) => d.factor).join("*"), "1000*2", "factors");
    },
  },
];

export function main(): number {
  console.log(`correct egress   ${repairedEgress(TARIFF_2026_11, REEL).toFixed(6)} USD`);
  console.log(`buggy egress     ${buggyEgress(PER_MEGABYTE, REEL).toFixed(6)} USD`);
  console.log(`correct total    ${correctTotal.toFixed(6)} USD`);
  console.log(`buggy total      ${buggyTotal.toFixed(6)} USD`);
  console.log(`factor           ${(buggyTotal / correctTotal).toFixed(0)}x`);
  console.log("");
  for (const defect of findDefects()) {
    console.log(`- ${defect.what} (x${defect.factor})`);
  }
  console.log("");
  console.log(`the download is ${REEL.egressBytes / BYTES.MB} MB, not ${REEL.egressBytes} bytes`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
