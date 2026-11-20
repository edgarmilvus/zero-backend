/**
 * Exercise 4 - the workload the client cannot do.
 *
 * A ledger that always answers "free" is not a ledger. It is a sales deck. The
 * client has ceilings, and the useful engineering is to know which one you hit
 * before you promise anything: here, a 6 GB file and a 32-bit address space.
 *
 * The server path stays available. Saying no to the client is not saying no to
 * the feature - it is saying no to one path, with the reason attached.
 */

import {
  BYTES,
  TARIFF_2026_11,
  type Tariff,
} from "../tariff.ts";
import {
  LedgerRefusal,
  clientLatencyMs,
  clientRow,
  serverLatencyMs,
  serverRow,
  type Workload,
} from "../ledger.ts";
import { REEL, withMeasurement } from "../reel.ts";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

/** One WebAssembly instance sees 4 GB, whatever the machine has. */
export const ADDRESS_SPACE_BYTES = 4 * BYTES.GB;

export type Decision = "move" | "leave" | "refuse";

export const BIG: Workload = {
  ...REEL,
  id: "reel-6gb",
  label: "one 6 GB export, single file",
  uploadBytes: 6 * BYTES.GB,
  egressBytes: 6 * BYTES.GB,
  workerSeconds: 240,
  loses: ["nothing: this one does not run on the client at all"],
  refusal: null,
};

const IOS: Workload["refusal"] = {
  reason: "a 6 GB file does not fit the address space a single instance can address",
  ceiling: "4 GB per WebAssembly instance, and iOS Safari below 17 has no threads",
  fallbackChapter: 8,
};

/** The workload, refused, with the sentence the ledger will print. */
export function refuseIfTooBig(workload: Workload): Workload {
  const bytes = workload.uploadBytes * workload.items;
  if (bytes <= ADDRESS_SPACE_BYTES) return workload;
  return {
    ...workload,
    refusal: IOS,
    client: {
      wallClockMs: Number.POSITIVE_INFINITY,
      peakHeapBytes: 0,
      source: "refused",
      record: null,
    },
  };
}

export function decide(workload: Workload, tariff: Tariff): Decision {
  void tariff;
  if (workload.client?.source === "refused") return "refuse";
  if (workload.uploadBytes * workload.items > ADDRESS_SPACE_BYTES) return "refuse";
  if (!workload.client) return "leave";
  return clientLatencyMs(workload) < serverLatencyMs(workload) / 2 ? "move" : "leave";
}

const refusedBig = refuseIfTooBig(BIG);
const measuredReel = withMeasurement(REEL, {
  wallClockMs: 412.5,
  peakHeapBytes: 130_000_000,
  source: "measured",
  record: "runs/chapter01/reel-120mb/record.json",
});

export const checks: readonly Check[] = [
  {
    name: "six gigabytes in one file decides refuse",
    run: () => eq(decide(refusedBig, TARIFF_2026_11), "refuse", "decision"),
  },
  {
    name: "the refusal names the size",
    run: () => expect(refusedBig.refusal?.reason.includes("6 GB") === true, String(refusedBig.refusal?.reason)),
  },
  {
    name: "the refusal names the ceiling",
    run: () => expect(refusedBig.refusal?.ceiling.includes("4 GB") === true, String(refusedBig.refusal?.ceiling)),
  },
  {
    name: "the refusal points at the chapter that handles the fallback",
    run: () => eq(refusedBig.refusal?.fallbackChapter, 8, "fallbackChapter"),
  },
  {
    name: "the client row throws a refusal, not a number",
    run: () => {
      const error = throws(() => clientRow(refusedBig), "refused workload");
      return expect(error instanceof LedgerRefusal, error.name);
    },
  },
  {
    name: "the server row still prices the same file",
    run: () => expect(serverRow(BIG, TARIFF_2026_11).perThousandUsd > 0, "server fallback"),
  },
  {
    name: "two gigabytes in one file does not refuse",
    run: () => {
      const medium: Workload = { ...REEL, uploadBytes: 2 * BYTES.GB, egressBytes: 2 * BYTES.GB };
      return expect(
        decide(refuseIfTooBig(medium), TARIFF_2026_11) !== "refuse",
        "should not refuse",
      );
    },
  },
  {
    name: "the measured reel decides move",
    run: () => eq(decide(measuredReel, TARIFF_2026_11), "move", "decision"),
  },
  {
    name: "a workload with no measurement decides leave, not move",
    run: () => eq(decide(REEL, TARIFF_2026_11), "leave", "decision"),
  },
];

export function main(): number {
  console.log(`address space   ${ADDRESS_SPACE_BYTES / BYTES.GB} GB`);
  console.log(`decision        6 GB file: ${decide(refusedBig, TARIFF_2026_11)}`);
  console.log(`decision        measure reel: ${decide(measuredReel, TARIFF_2026_11)}`);
  console.log(`decision        unmeasured reel: ${decide(REEL, TARIFF_2026_11)}`);
  console.log("");
  console.log(`reason          ${refusedBig.refusal?.reason ?? "none"}`);
  console.log(`ceiling         ${refusedBig.refusal?.ceiling ?? "none"}`);
  console.log(`fallback        chapter ${refusedBig.refusal?.fallbackChapter ?? "none"}`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
