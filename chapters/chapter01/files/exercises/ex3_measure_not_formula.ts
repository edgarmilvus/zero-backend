/**
 * Exercise 3 - the client number is not a formula.
 *
 * An estimate is a sentence with a number in it. What the ledger needs is a
 * measurement: a wall clock from this process, on this machine, over these bytes.
 * The exercise measures once, compares, and then proves that the table changed
 * because the record changed.
 */

import { RENDER_BUDGET_MS, clientLatencyMs, clientRow, compare } from "../ledger.ts";
import type { ClientMeasurement } from "../ledger.ts";
import { BYTES, TARIFF_2026_11 } from "../tariff.ts";
import { measureOnce, sha256 } from "../measure.ts";
import { REEL, withMeasurement } from "../reel.ts";
import { duration } from "../ledger.ts";
import { renderMarkdown } from "../report.ts";
import { eq, expect, near, type Check } from "./selfcheck.ts";

const SIZE = 12 * BYTES.MB;

/** A deterministic buffer, so the digest is the same on every machine. */
export function twelveMegabytes(): Uint8Array {
  const buffer = new Uint8Array(SIZE);
  let state = 0x9e3779b9;
  for (let i = 0; i < buffer.length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    buffer[i] = state >>> 24;
  }
  return buffer;
}

/** The measurement, as the ledger wants it. */
export function measureTwelve(): { measurement: ClientMeasurement; throughputMbps: number } {
  const measured = measureOnce(twelveMegabytes());
  const seconds = measured.wallClockMs / 1000;
  return {
    measurement: {
      wallClockMs: measured.wallClockMs,
      peakHeapBytes: measured.peakHeapBytes,
      source: "measured",
      record: "chapters/chapter01/files/exercises/ex3_measure_not_formula.ts",
    },
    throughputMbps: measured.bytes / seconds / BYTES.MB,
  };
}

const { measurement, throughputMbps } = measureTwelve();
const measuredWorkload = withMeasurement(REEL, measurement);
const estimatedWorkload = withMeasurement(REEL, {
  wallClockMs: 600,
  peakHeapBytes: 0,
  source: "estimate",
  record: null,
});

export const checks: readonly Check[] = [
  {
    name: "the measurement reports the bytes it touched",
    run: () => eq(measureOnce(new Uint8Array(SIZE)).bytes, SIZE, "bytes"),
  },
  {
    name: "the wall clock is finite and positive",
    run: () =>
      expect(
        Number.isFinite(measurement.wallClockMs) && measurement.wallClockMs > 0,
        `got ${measurement.wallClockMs}`,
      ),
  },
  {
    name: "hashing runs faster than a hundred megabytes a second",
    run: () => expect(throughputMbps > 100, `got ${throughputMbps.toFixed(0)} MB/s`),
  },
  {
    name: "the estimate and the measurement are different numbers",
    run: () => expect(measurement.wallClockMs !== 600, "the estimate leaked into the result"),
  },
  {
    name: "the client latency is the measured clock plus one repaint",
    run: () => near(clientLatencyMs(measuredWorkload), measurement.wallClockMs + RENDER_BUDGET_MS, 1e-9, "latency"),
  },
  {
    name: "a measured row says measured and names its record",
    run: () =>
      expect(
        clientRow(measuredWorkload).assumptions[0]?.includes("measured") === true,
        "should say measured",
      ),
  },
  {
    name: "an estimate is labelled as an estimate",
    run: () => {
      const [line] = clientRow(estimatedWorkload).assumptions;
      expect(line?.includes("estimate") === true, String(line));
      return expect(line?.includes("no record") === true, "an estimate has no record");
    },
  },
  {
    name: "the table carries the measured duration, not the estimate",
    run: () => {
      const table = renderMarkdown(compare(measuredWorkload, TARIFF_2026_11));
      return expect(table.includes(duration(clientLatencyMs(measuredWorkload))), table);
    },
  },
  {
    name: "the peak heap is at least the buffer",
    run: () => expect(measurement.peakHeapBytes >= SIZE, "peakHeapBytes"),
  },
  {
    name: "the digest is stable across two passes",
    run: () => eq(sha256(twelveMegabytes()), sha256(twelveMegabytes()), "sha256"),
  },
];

export function main(): number {
  console.log(`bytes          ${SIZE}`);
  console.log(`wall clock     ${measurement.wallClockMs.toFixed(1)} ms`);
  console.log(`throughput     ${throughputMbps.toFixed(0)} MB/s`);
  console.log(`peak heap      ${measurement.peakHeapBytes}`);
  console.log(`client latency ${duration(clientLatencyMs(measuredWorkload))}`);
  console.log(`estimate said  ${duration(600 + RENDER_BUDGET_MS)} (not used)`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
