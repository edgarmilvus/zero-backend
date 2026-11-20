/**
 * One workload, two paths, one row.
 *
 * The ledger does not decide anything. It prices the server path from a tariff,
 * takes the client path from a measurement, and refuses to produce a row that is
 * missing one of the five columns the book prints.
 */

import {
  BYTES,
  assertTariffIsSourced,
  priceCompute,
  priceEgress,
  priceRequest,
  priceStorage,
  type Tariff,
} from "./tariff.ts";

export type PathName = "server" | "client";

export type Refusal = {
  /** What the client cannot do, in one sentence. */
  readonly reason: string;
  /** The ceiling that stops it, named. */
  readonly ceiling: string;
  /** The chapter that handles the fallback. */
  readonly fallbackChapter: number;
};

export type ClientMeasurement = {
  readonly wallClockMs: number;
  readonly peakHeapBytes: number;
  /** `refused` means the client cannot run this at all. */
  readonly source: "measured" | "estimate" | "refused";
  /** The record this number came from, relative to the repository root. */
  readonly record: string | null;
};

export type Workload = {
  readonly id: string;
  readonly label: string;
  /** How many items one job processes. One reel is 1, one batch is 4000. */
  readonly items: number;
  /** Billable requests per item on the server path. */
  readonly requestsPerItem: number;
  /** Bytes that leave the device on the server path, per item: the upload. */
  readonly uploadBytes: number;
  /** Bytes that come back to the device on the server path, per item. */
  readonly egressBytes: number;
  /** Memory the worker asks for, in MB. */
  readonly workerMb: number;
  /** Worker seconds per item. */
  readonly workerSeconds: number;
  /** How many items the server runs at once. 1 is a queue. */
  readonly concurrency: number;
  /** Gigabyte-months kept after the job, per job. */
  readonly storageGbMonths: number;
  /** Absent until somebody measures it. A workload without one is priced on one path only. */
  readonly client?: ClientMeasurement;
  /** The fifth column: what this path gives up. Never empty. */
  readonly loses: readonly string[];
  readonly refusal: Refusal | null;
};

export type CostRow = {
  readonly path: PathName;
  readonly perThousandUsd: number;
  readonly latencyMs: number;
  readonly bytesLeavingDevice: number;
  readonly loses: string;
  readonly assumptions: readonly string[];
};

export type ServerBreakdown = {
  readonly requestsUsd: number;
  readonly computeUsd: number;
  readonly egressUsd: number;
  readonly storageUsd: number;
  readonly totalUsd: number;
};

/**
 * The three numbers the server path needs and nobody measured: an uplink, a
 * downlink and a queue. They are declared here, printed in the transcript, and
 * included in the row's assumptions, because a latency nobody can check is a
 * latency nobody should quote.
 */
export const ASSUMED_UPLINK_MBPS = 20;
export const ASSUMED_DOWNLINK_MBPS = 100;
export const QUEUE_MS = 400;
export const RENDER_BUDGET_MS = 120;

/** The client cannot run this workload, and the ledger must say so. */
export class LedgerRefusal extends Error {
  readonly reason: string;
  readonly ceiling: string;
  readonly fallbackChapter: number;

  constructor(refusal: Refusal) {
    super(`client cannot run this workload: ${refusal.reason} (${refusal.ceiling})`);
    this.name = "LedgerRefusal";
    this.reason = refusal.reason;
    this.ceiling = refusal.ceiling;
    this.fallbackChapter = refusal.fallbackChapter;
  }
}

/** The workload has no client measurement, so the second column does not exist. */
export class MissingMeasurement extends Error {
  readonly workloadId: string;

  constructor(workloadId: string) {
    super(
      `workload ${workloadId} has no client measurement: run the measurement first, ` +
        `or price the server path alone`,
    );
    this.name = "MissingMeasurement";
    this.workloadId = workloadId;
  }
}

function measurementOf(workload: Workload): ClientMeasurement {
  if (!workload.client) throw new MissingMeasurement(workload.id);
  return workload.client;
}


const MBITS = 1e6;

/** Upload, queue, the worker, the download, and the repaint, in that order. */
export function serverLatencyMs(workload: Workload): number {
  const items = workload.items;
  const up = ((workload.uploadBytes * items * 8) / (ASSUMED_UPLINK_MBPS * MBITS)) * 1000;
  const down = ((workload.egressBytes * items * 8) / (ASSUMED_DOWNLINK_MBPS * MBITS)) * 1000;
  const work = (workload.workerSeconds * items * 1000) / Math.max(1, workload.concurrency);
  return up + QUEUE_MS + work + down + RENDER_BUDGET_MS;
}

/** The measured wall clock, plus the same repaint every path pays. */
export function clientLatencyMs(workload: Workload): number {
  return measurementOf(workload).wallClockMs + RENDER_BUDGET_MS;
}

export function priceServer(workload: Workload, tariff: Tariff): ServerBreakdown {
  assertTariffIsSourced(tariff);

  const requestsUsd = priceRequest(tariff, workload.items * workload.requestsPerItem);
  const gbSeconds =
    (workload.workerMb / 1024) * workload.workerSeconds * workload.items;
  const computeUsd = priceCompute(tariff, gbSeconds);
  const egressUsd = priceEgress(tariff, workload.egressBytes * workload.items);
  const storageUsd = priceStorage(tariff, workload.storageGbMonths);
  const totalUsd = requestsUsd + computeUsd + egressUsd + storageUsd;

  return { requestsUsd, computeUsd, egressUsd, storageUsd, totalUsd };
}

export function serverRow(workload: Workload, tariff: Tariff): CostRow {
  const breakdown = priceServer(workload, tariff);
  return {
    path: "server",
    perThousandUsd: breakdown.totalUsd * 1000,
    latencyMs: serverLatencyMs(workload),
    bytesLeavingDevice: workload.uploadBytes * workload.items,
    loses: workload.loses.join("; "),
    assumptions: [
      `uplink ${ASSUMED_UPLINK_MBPS} Mbps`,
      `downlink ${ASSUMED_DOWNLINK_MBPS} Mbps`,
      `queue ${QUEUE_MS} ms`,
      `concurrency ${workload.concurrency}`,
      `tariff ${tariff.id} (${tariff.source.readOn})`,
    ],
  };
}

export function clientRow(workload: Workload): CostRow {
  const measurement = measurementOf(workload);

  if (measurement.source === "refused") {
    throw new LedgerRefusal(
      workload.refusal ?? {
        reason: "the ledger was told the client refuses the work and not why",
        ceiling: "unnamed",
        fallbackChapter: 0,
      },
    );
  }

  return {
    path: "client",
    perThousandUsd: 0,
    latencyMs: clientLatencyMs(workload),
    bytesLeavingDevice: 0,
    loses: workload.loses.join("; "),
    assumptions: [
      `client ${measurement.source} (${measurement.record ?? "no record"})`,
      `peak heap ${measurement.peakHeapBytes} bytes`,
      `repaint ${RENDER_BUDGET_MS} ms`,
    ],
  };
}

/** Both rows, or a refusal. There is no third answer. */
export function compare(
  workload: Workload,
  tariff: Tariff,
): { readonly server: CostRow; readonly client: CostRow } {
  return { server: serverRow(workload, tariff), client: clientRow(workload) };
}

/**
 * How many jobs a month the server path can run before it eats a budget.
 * The client path has no such line, which is the point of the fourth figure.
 */
export function breakEven(
  workload: Workload,
  tariff: Tariff,
  monthlyBudgetUsd: number,
): { readonly usdPerJob: number; readonly jobsPerMonth: number } {
  const { totalUsd } = priceServer(workload, tariff);
  if (totalUsd <= 0) {
    return { usdPerJob: 0, jobsPerMonth: Number.POSITIVE_INFINITY };
  }
  return { usdPerJob: totalUsd, jobsPerMonth: monthlyBudgetUsd / totalUsd };
}

export function usd(value: number): string {
  if (!Number.isFinite(value)) return "unbounded";
  if (value === 0) return "$0.00";
  if (value >= 1000) return `$${value.toFixed(0)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value >= 0.000001) return `$${value.toFixed(6)}`;
  return "<$0.000001";
}

export function megabytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const mb = bytes / BYTES.MB;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / BYTES.KB).toFixed(1)} kB`;
}

export function duration(ms: number): string {
  if (Number.isFinite(ms) === false) return "unbounded";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(0)} ms`;
}

/** One row, one line, the same shape for both paths. */
export function formatRow(row: CostRow): string {
  return [
    row.path.padEnd(6),
    usd(row.perThousandUsd).padStart(9),
    duration(row.latencyMs).padStart(8),
    megabytes(row.bytesLeavingDevice).padStart(9),
    "|",
    row.loses,
  ].join("  ");
}

export function formatTable(rows: readonly CostRow[]): string {
  return rows.map(formatRow).join("\n");
}
