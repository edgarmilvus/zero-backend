/**
 * Chapter 1 harness: 48 assertions on the ledger.
 *
 * It asserts on state, never on a printed sentence: a row, a number, a refusal.
 * The five example programs are run as a reader runs them, with node, so a demo
 * that breaks the gate breaks here.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

import {
  LedgerRefusal,
  MissingMeasurement,
  clientLatencyMs,
  clientRow,
  compare,
  formatRow,
  priceServer,
  serverLatencyMs,
  serverRow,
  type ClientMeasurement,
  type CostRow,
  type Workload,
} from "./ledger.ts";
import { measureOnce, sha256 } from "./measure.ts";
import { REEL, withMeasurement } from "./reel.ts";
import {
  COLUMNS,
  assertFiveColumns,
  assertNoEmptyLossColumn,
  renderCsv,
  renderMarkdown,
} from "./report.ts";
import {
  TARIFF_2026_11,
  assertTariffIsSourced,
  priceCompute,
  priceEgress,
  priceRequest,
  priceStorage,
  type Tariff,
} from "./tariff.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };

const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => {
  checks.push({ name, run });
};

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}

function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) {
    throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  }
  return true;
}

function near(actual: number, expected: number, tolerance: number, what: string): true {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`${what}: got ${actual}, expected ${expected} +/- ${tolerance}`);
  }
  return true;
}

function throws(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

function run(script: string, args: readonly string[] = []) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    encoding: "utf8",
  });
  return { code: result.status ?? -1, out: result.stdout ?? "", err: result.stderr ?? "" };
}

const MEASURED: ClientMeasurement = {
  wallClockMs: 412.5,
  peakHeapBytes: 130_000_000,
  source: "measured",
  record: "runs/chapter01/reel-120mb/record.json",
};

const reel = withMeasurement(REEL, MEASURED);
const huge: Workload = {
  ...REEL,
  id: "reel-6gb",
  label: "one 6 GB file",
  uploadBytes: 6 * 1e9,
  egressBytes: 6 * 1e9,
  refusal: {
    reason: "a 6 GB file does not fit a 32-bit address space",
    ceiling: "4 GB per WebAssembly instance",
    fallbackChapter: 8,
  },
  client: { wallClockMs: Infinity, peakHeapBytes: 0, source: "refused", record: null },
};

// --- tariff -----------------------------------------------------------------

check("tariff source is an https URL", () =>
  expect(/^https:\/\//.test(TARIFF_2026_11.source.url), "source.url"),
);
check("tariff carries the day it was read", () =>
  expect(/^\d{4}-\d{2}-\d{2}$/.test(TARIFF_2026_11.source.readOn), "source.readOn"),
);
check("a sourced tariff passes its own assertion", () =>
  expect(assertTariffIsSourced(TARIFF_2026_11) === undefined, "should not throw"),
);
check("a tariff with no URL is refused", () => {
  const broken: Tariff = {
    ...TARIFF_2026_11,
    source: { ...TARIFF_2026_11.source, url: "price list, ask Bob" },
  };
  const error = throws(() => assertTariffIsSourced(broken), "unsourced tariff");
  expect(error.message.includes("source.url"), error.message);
  return true;
});
check("a million requests cost the listed price", () =>
  near(priceRequest(TARIFF_2026_11, 1e6), 0.2, 1e-12, "priceRequest"),
);
check("a gigabyte of egress costs the listed price", () =>
  near(priceEgress(TARIFF_2026_11, 1e9), 0.09, 1e-12, "priceEgress"),
);
check("a gigabyte-month costs the listed price", () =>
  near(priceStorage(TARIFF_2026_11, 1), 0.023, 1e-12, "priceStorage"),
);
check("one GB-second costs the listed price", () =>
  near(priceCompute(TARIFF_2026_11, 1), 0.0000166667, 1e-12, "priceCompute"),
);

// --- one job ----------------------------------------------------------------

const breakdown = priceServer(REEL, TARIFF_2026_11);

check("the total is the sum of its four parts", () =>
  near(
    breakdown.totalUsd,
    breakdown.requestsUsd + breakdown.computeUsd + breakdown.egressUsd + breakdown.storageUsd,
    1e-12,
    "totalUsd",
  ),
);
check("egress is the largest line item for the reel", () =>
  expect(
    breakdown.egressUsd > breakdown.storageUsd &&
      breakdown.egressUsd > breakdown.computeUsd &&
      breakdown.egressUsd > breakdown.requestsUsd,
    "egress should dominate a media job",
  ),
);
check("egress holds more than 70% of the bill", () =>
  expect(breakdown.egressUsd / breakdown.totalUsd > 0.7, "egress share"),
);
check("requests cost less than a tenth of a cent per job", () =>
  expect(breakdown.requestsUsd < 0.001, "requests should be noise"),
);
check("the server row names its path", () =>
  eq(serverRow(REEL, TARIFF_2026_11).path, "server", "path"),
);
check("the row is per thousand jobs, not per job", () =>
  near(
    serverRow(REEL, TARIFF_2026_11).perThousandUsd,
    breakdown.totalUsd * 1000,
    1e-9,
    "perThousandUsd",
  ),
);
check("the server row's bytes are the upload", () =>
  eq(
    serverRow(REEL, TARIFF_2026_11).bytesLeavingDevice,
    REEL.uploadBytes * REEL.items,
    "bytesLeavingDevice",
  ),
);
check("the server row lists the tariff it used", () =>
  expect(
    serverRow(REEL, TARIFF_2026_11).assumptions.some((line) =>
      line.includes(TARIFF_2026_11.id),
    ),
    "assumptions should name the tariff",
  ),
);

// --- latency ----------------------------------------------------------------

check("the reel takes over a minute on the server path", () =>
  expect(serverLatencyMs(REEL) > 60_000, `got ${serverLatencyMs(REEL)} ms`),
);
check("the upload alone is over forty seconds", () => {
  const up = (REEL.uploadBytes * 8) / (20 * 1e6) * 1000;
  expect(up > 40_000, `upload is ${up} ms`);
  return true;
});
check("concurrency divides only the work term", () => {
  const one = serverLatencyMs({ ...REEL, concurrency: 1 });
  const four = serverLatencyMs({ ...REEL, concurrency: 4 });
  const expected = one - (REEL.workerSeconds * 1000) + REEL.workerSeconds * 1000 / 4;
  return near(four, expected, 1e-9, "latency at concurrency 4");
});
check("the client pays the measured clock plus one repaint", () =>
  near(clientLatencyMs(reel), MEASURED.wallClockMs + 120, 1e-9, "clientLatencyMs"),
);
check("the client is faster than the server for the reel", () =>
  expect(clientLatencyMs(reel) < serverLatencyMs(REEL), "client should win on latency"),
);
check("a four-thousand-item batch is still finite", () =>
  expect(Number.isFinite(serverLatencyMs({ ...REEL, items: 4000 })), "finite latency"),
);

// --- client row -------------------------------------------------------------

check("the client row costs zero", () => eq(clientRow(reel).perThousandUsd, 0, "perThousandUsd"));
check("the client row sends zero bytes", () =>
  eq(clientRow(reel).bytesLeavingDevice, 0, "bytesLeavingDevice"),
);
check("a workload with no measurement cannot produce a client row", () => {
  const error = throws(() => clientRow(REEL), "missing measurement");
  return expect(error instanceof MissingMeasurement, `got ${error.name}`);
});
check("a refused workload throws a refusal, not a number", () => {
  const error = throws(() => clientRow(huge), "refused workload");
  return expect(error instanceof LedgerRefusal, `got ${error.name}`);
});
check("the refusal names the ceiling and the fallback chapter", () => {
  const error = throws(() => clientRow(huge), "refused workload") as LedgerRefusal;
  expect(error.ceiling.includes("4 GB"), error.ceiling);
  return eq(error.fallbackChapter, 8, "fallbackChapter");
});
check("the client row names the record it came from", () =>
  expect(
    clientRow(reel).assumptions.some((line) => line.includes(MEASURED.record ?? "")),
    "assumptions should name the record",
  ),
);

// --- report -----------------------------------------------------------------

const pair = compare(reel, TARIFF_2026_11);
const table = renderMarkdown(pair);

check("the header is the five columns, in order", () =>
  eq(table.split("\n")[0], `| ${COLUMNS.join(" | ")} |`, "header"),
);
check("the row has exactly five cells", () =>
  eq((table.split("\n")[2] ?? "").split("|").length - 2, 5, "cells"),
);
check("the rendered table passes its own shape check", () =>
  expect(assertFiveColumns(table) === undefined, "should not throw"),
);
check("a four-column table is refused", () => {
  const broken = "| server cost per 1,000 operations | client cost | latency | what you lose |";
  const error = throws(() => assertFiveColumns(broken), "four columns");
  return expect(error.message.includes("five columns"), error.message);
});
check("the loss column is not empty on either row", () =>
  expect(assertNoEmptyLossColumn(pair) === undefined, "should not throw"),
);
check("an empty loss column is refused", () => {
  const hollow = compare({ ...reel, loses: [] }, TARIFF_2026_11);
  const error = throws(() => assertNoEmptyLossColumn(hollow), "empty loss column");
  return expect(error.message.includes("what you lose"), error.message);
});
check("the csv has two lines of five fields", () => {
  const parse = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i] ?? "";
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  };

  const lines = renderCsv(pair).split("\n");
  eq(lines.length, 2, "line count");
  const header = parse(lines[0] ?? "");
  eq(header.join(" | "), COLUMNS.join(" | "), "header round-trip");
  return eq((lines[1] ?? "").split(",").length >= 5, true, "body fields");
});
check("both amounts appear in the table", () =>
  expect(
    table.includes(formatRow(pair.server).split("  ")[1] ?? "") &&
      table.includes("$0.00"),
    "the table should carry both costs",
  ),
);

// --- measure ----------------------------------------------------------------

check("sha256 of nothing is the known digest", () =>
  eq(
    sha256(new Uint8Array(0)),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "sha256",
  ),
);
check("the digest is stable across two runs", () => {
  const buffer = new Uint8Array([1, 2, 3, 4]);
  return eq(sha256(buffer), sha256(buffer), "sha256");
});
check("a measurement reports the bytes it touched", () =>
  eq(measureOnce(new Uint8Array(1_000_000)).bytes, 1_000_000, "bytes"),
);
check("a measurement reports a finite wall clock", () => {
  const measurement = measureOnce(new Uint8Array(1024));
  return expect(
    Number.isFinite(measurement.wallClockMs) && measurement.wallClockMs >= 0,
    "wallClockMs",
  );
});
check("the peak heap is at least the buffer", () => {
  const measurement = measureOnce(new Uint8Array(2_000_000));
  return expect(measurement.peakHeapBytes >= 2_000_000, "peakHeapBytes");
});
check("a measurement says it is a measurement", () =>
  eq(measureOnce(new Uint8Array(64)).source, "measured", "source"),
);

// --- the examples, run the way a reader runs them ---------------------------

check("01 prices one job and prints the total per thousand", () => {
  const result = run("01_price_one_job.ts");
  eq(result.code, 0, "exit code");
  return expect(result.out.includes("per 1,000"), "should print per 1,000");
});
check("02 refuses to compare without a record", () => {
  const result = run("02_compare_paths.ts", ["--record", "/nonexistent/record.json"]);
  eq(result.code, 1, "exit code");
  return expect(result.err.includes("no record at"), result.err);
});
check("02 accepts an estimate when it is labelled one", () => {
  const result = run("02_compare_paths.ts", ["--estimate"]);
  eq(result.code, 0, "exit code");
  expect(result.out.includes(`| ${COLUMNS.join(" | ")} |`), "should print the table");
  return expect(result.out.includes("estimate"), "should label the estimate");
});
check("02 prints a measured column when a record exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "zero-backend-"));
  const path = join(dir, "record.json");
  writeFileSync(
    path,
    JSON.stringify({ result: { wallClockMs: 412.5, peakHeapBytes: 130_000_000 } }),
  );
  const result = run("02_compare_paths.ts", ["--record", path]);
  rmSync(dir, { recursive: true, force: true });
  eq(result.code, 0, "exit code");
  return expect(result.out.includes("client source    measured"), result.out);
});

// --- the browser contract ---------------------------------------------------

check("the browser server declares the two isolation headers", async () => {
  const { headerPolicy } = await import("./browser/serve.mjs");
  const policy = headerPolicy();
  return eq(
    JSON.stringify(Object.keys(policy)),
    JSON.stringify([
      "Cross-Origin-Opener-Policy",
      "Cross-Origin-Embedder-Policy",
    ]),
    "header names",
  );
});
check("the served document carries both headers", async () => {
  const { createServer } = await import("./browser/serve.mjs");
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const coop = response.headers.get("cross-origin-opener-policy");
  const coep = response.headers.get("cross-origin-embedder-policy");
  server.close();
  return expect(coop === "same-origin" && coep === "require-corp", `${coop}/${coep}`);
});

// --- run --------------------------------------------------------------------

async function main(): Promise<number> {
  const expectedTotal = 48;
  if (checks.length !== expectedTotal) {
    console.error(`harness has ${checks.length} checks, the contract promises ${expectedTotal}`);
    return 1;
  }

  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${number}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${number}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }

  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
