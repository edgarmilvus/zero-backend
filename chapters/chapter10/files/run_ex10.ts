/**
 * Chapter 10 harness: 56 assertions against a columnar engine, in this process.
 *
 * DuckDB's node build is the same WebAssembly the page loads, so the harness does not mock the
 * database: it generates a million rows, groups them, writes them to Parquet and reads them back.
 * The browser's numbers are in the chapter's record; these are the ones the gate can reproduce on
 * any machine with `npm ci`.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGGREGATE_BY_KIND,
  COUNT_EVENTS,
  CREATE_EVENTS,
  KINDS,
  ROW_COUNT,
  TOP_USERS,
  aggregateFrom,
  countFrom,
  expectedKindCount,
  expectedSum,
  expectedSums,
} from "./queries.ts";
import { bundleBytes, openDuck } from "./duck.ts";
import {
  assertParquetSmaller,
  assertSum,
  humanBytes,
  renderAggregate,
  renderParquet,
  type KindRow,
  type UserRow,
} from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

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
function throwsSync(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}
async function throwsAsync(fn: () => Promise<unknown>, what: string): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}
const near = (actual: number, expected: number, tolerance: number): boolean =>
  Math.abs(actual - expected) <= tolerance;

// --- the arithmetic, with no engine ------------------------------------------

check("a million rows is the chapter's unit", () => eq(ROW_COUNT, 1_000_000, "rows"));
check("the expected total is 499,995,000", () => eq(expectedSum(), 499_995_000, "sum"));
check("kind 0 gets one extra row per cycle", () => eq(expectedKindCount(0), 142_858, "kind 0"));
check("the other six kinds get 142,857", () =>
  eq(
    [1, 2, 3, 4, 5, 6].map((kind) => expectedKindCount(kind)).join(","),
    "142857,142857,142857,142857,142857,142857",
    "kinds",
  ),
);
check("the seven kind counts add up to the table", () =>
  eq(
    KINDS.reduce((sum, _kind, index) => sum + expectedKindCount(index), 0),
    ROW_COUNT,
    "total",
  ),
);
check("the per-kind sums add up to the total sum", () => {
  const parts = expectedSums();
  return near(
    parts.reduce((sum, value) => sum + value, 0),
    expectedSum(),
    0.01,
  ) ? true : (() => { throw new Error("the parts do not add up"); })();
});
check("a kind outside 0..6 is refused", () => {
  const error = throwsSync(() => expectedKindCount(7), "kind 7");
  return expect(error.message.includes("0..6"), error.message);
});
check("a negative kind is refused", () => {
  const error = throwsSync(() => expectedKindCount(-1), "kind -1");
  return expect(error.message.includes("0..6"), error.message);
});
check("the aggregate can run against a table or a file", () =>
  expect(aggregateFrom("'x.parquet'").includes("from 'x.parquet'"), "source"),
);

// --- the engine --------------------------------------------------------------

const { duck, coldMs } = await openDuck();

check("the engine reports a version", () => expect(/^v\d+\./.test(duck.version), duck.version));
check("the binding identifies itself as the node one", () => eq(duck.engine, "duckdb-node", "engine"));
check("the cold start is a real measurement", () => expect(coldMs > 0, `${coldMs}`));
check("the feature flags are a number", () => expect(Number.isInteger(duck.features), `${duck.features}`));
check("the wasm on disk is more than fifty megabytes", () =>
  expect(bundleBytes() > 50 * 1024 * 1024, `${humanBytes(bundleBytes())}`),
);
check("a trivial query returns one row", async () => {
  const rows = await duck.query<{ one: number }>("select 1 as one");
  return eq(rows[0]?.one, 1, "one");
});
check("a count is a number and not a bigint", async () => {
  const [row] = await duck.query<{ n: number }>("select 42::bigint as n");
  return expect(typeof row?.n === "number" && row.n === 42, `n is ${typeof row?.n}`);
});

// --- the table ---------------------------------------------------------------

const createStarted = performance.now();
await duck.query(CREATE_EVENTS);
const createMs = performance.now() - createStarted;

check("the generated table has a million rows", async () => {
  const [row] = await duck.query<{ n: number }>(COUNT_EVENTS);
  return eq(row?.n, ROW_COUNT, "rows");
});
check("the table was built in less than ten seconds", () =>
  expect(createMs > 0 && createMs < 10_000, `${createMs.toFixed(0)} ms`),
);
check("the ids run from zero to a million minus one", async () => {
  const [row] = await duck.query<{ lo: number; hi: number }>("select min(id)::bigint as lo, max(id)::bigint as hi from events");
  eq(row?.lo, 0, "min");
  return eq(row?.hi, ROW_COUNT - 1, "max");
});
check("there are exactly seven kinds", async () => {
  const [row] = await duck.query<{ n: number }>("select count(distinct kind)::bigint as n from events");
  return eq(row?.n, KINDS.length, "kinds");
});
check("every kind's row count matches the arithmetic", async () => {
  const rows = await duck.query<{ kind: number; n: number }>(
    "select kind, count(*)::bigint as n from events group by kind order by kind",
  );
  return eq(
    rows.map((row) => row.n).join(","),
    KINDS.map((_kind, index) => expectedKindCount(index)).join(","),
    "counts",
  );
});
check("there are a thousand users", async () => {
  const [row] = await duck.query<{ n: number }>("select count(distinct user_id)::bigint as n from events");
  return eq(row?.n, 1000, "users");
});
check("every amount is a non-negative number below a thousand", async () => {
  const [row] = await duck.query<{ lo: number; hi: number }>(
    "select min(amount) as lo, max(amount) as hi from events",
  );
  eq(row?.lo !== undefined && row.lo >= 0, true, "min");
  return expect((row?.hi ?? 0) < 1000, `max ${row?.hi}`);
});
check("the column types are the ones the schema promised", async () => {
  const rows = await duck.query<{ column_name: string; column_type: string }>(
    "describe select * from events",
  );
  return eq(
    rows.map((row) => `${row.column_name}:${row.column_type}`).join(" "),
    "id:BIGINT user_id:INTEGER kind:INTEGER day:INTEGER amount:DOUBLE",
    "schema",
  );
});

// --- the aggregate -----------------------------------------------------------

const aggregateStarted = performance.now();
const aggregate = await duck.query<KindRow>(AGGREGATE_BY_KIND);
const aggregateMs = performance.now() - aggregateStarted;

check("the aggregate returns one row per kind", () => eq(aggregate.length, KINDS.length, "rows"));
check("the totals match the arithmetic to the cent", () => expect(assertSum(aggregate, expectedSums()) === undefined, "sum"));
check("every mean is about five hundred", () =>
  expect(aggregate.every((row) => near(row.mean, 500, 0.1)), JSON.stringify(aggregate.map((row) => row.mean))),
);
check("the aggregate is ordered by kind", () =>
  eq(aggregate.map((row) => row.kind).join(","), "0,1,2,3,4,5,6", "order"),
);
check("seven groups over a million rows cost less than five seconds", () =>
  expect(aggregateMs > 0 && aggregateMs < 5_000, `${aggregateMs.toFixed(0)} ms`),
);
check("top users returns ten rows", async () => {
  const rows = await duck.query<UserRow>(TOP_USERS);
  return eq(rows.length, 10, "rows");
});
check("the top users are ordered by count and then by id", async () => {
  const rows = await duck.query<UserRow>(TOP_USERS);
  const sorted = [...rows].sort((a, b) => b.n - a.n || a.user_id - b.user_id);
  return eq(rows.map((row) => row.user_id).join(","), sorted.map((row) => row.user_id).join(","), "order");
});
check("an empty result is an empty array", async () => {
  const rows = await duck.query("select kind from events where 1 = 0");
  return eq(rows.length, 0, "rows");
});

// --- the file ----------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), "zero-backend-duck-"));
const parquet = join(dir, "events.parquet");
const csv = join(dir, "events.csv");

await duck.query(`copy events to '${parquet}' (format parquet, compression zstd)`);
await duck.query(`copy events to '${csv}' (format csv, header)`);
const parquetBytes = statSync(parquet).size;
const csvBytes = statSync(csv).size;

check("the parquet file exists and is not empty", () =>
  expect(existsSync(parquet) && parquetBytes > 0, `${parquetBytes} bytes`),
);
check("the parquet is smaller than the csv", () => expect(assertParquetSmaller(parquetBytes, csvBytes) === undefined, "sizes"));
check("the parquet is under three megabytes", () => expect(parquetBytes < 3 * 1024 * 1024, `${humanBytes(parquetBytes)}`));
check("the csv is over twenty megabytes", () => expect(csvBytes > 20 * 1024 * 1024, `${humanBytes(csvBytes)}`));
check("the parquet is at least five times smaller", () => expect(csvBytes / parquetBytes >= 5, `${(csvBytes / parquetBytes).toFixed(1)}x`));
check("the file begins and ends with the parquet magic", () => {
  const bytes = readFileSync(parquet);
  eq(bytes.subarray(0, 4).toString("latin1"), "PAR1", "header");
  return eq(bytes.subarray(bytes.length - 4).toString("latin1"), "PAR1", "footer");
});
check("counting the parquet returns the table's rows", async () => {
  const [row] = await duck.query<{ n: number }>(countFrom(`'${parquet}'`));
  return eq(row?.n, ROW_COUNT, "rows");
});
check("the aggregate over the file matches the table's sums", async () => {
  const rows = await duck.query<KindRow>(aggregateFrom(`'${parquet}'`));
  assertSum(rows, expectedSums());
  return eq(rows.length, KINDS.length, "kinds");
});
check("the file has the five columns the table has", async () => {
  const rows = await duck.query<{ column_name: string }>(`describe select * from '${parquet}'`);
  return eq(rows.map((row) => row.column_name).join(","), "id,user_id,kind,day,amount", "columns");
});
check("a missing parquet is an error and not an empty result", async () => {
  const error = await throwsAsync(() => duck.query(`select * from '${join(dir, "nope.parquet")}'`), "missing");
  return expect(error.message.length > 0, "no message");
});
check("a column the file does not have is refused", async () => {
  const error = await throwsAsync(() => duck.query(`select nope from '${parquet}'`), "bad column");
  return expect(/nope/i.test(error.message), error.message.slice(0, 120));
});
check("the same file read twice returns the same sum", async () => {
  const [first] = await duck.query<{ s: number }>(`select sum(amount) as s from '${parquet}'`);
  const [second] = await duck.query<{ s: number }>(`select sum(amount) as s from '${parquet}'`);
  return eq(first?.s, second?.s, "sum");
});

// --- the report --------------------------------------------------------------

check("humanBytes formats megabytes", () => eq(humanBytes(2_422_153), "2.3 MB", "mb"));
check("humanBytes formats kilobytes", () => eq(humanBytes(4096), "4 kB", "kb"));
check("the aggregate rendering names the kinds and the time", () => {
  const text = renderAggregate(aggregate, 42);
  expect(text.includes("42 ms"), "time");
  return expect(text.includes("142857"), "count");
});
check("the parquet rendering states the ratio", () => {
  const text = renderParquet({
    rows: ROW_COUNT,
    parquetBytes,
    csvBytes,
    writeMs: 700,
    csvWriteMs: 350,
    scanMs: 70,
    countMs: 20,
  });
  return expect(text.includes("9.6x smaller"), text);
});
check("assertSum refuses a total that is off by a dollar", () => {
  const wrong = aggregate.map((row, index) => (index === 0 ? { ...row, total: row.total + 1 } : row));
  const error = throwsSync(() => assertSum(wrong, expectedSums()), "wrong sum");
  return expect(error.message.includes("expected"), error.message);
});

// --- the close ---------------------------------------------------------------

check("the harness closes the engine it opened", async () => {
  await duck.close();
  const error = await throwsAsync(() => duck.query("select 1"), "closed");
  return expect(error instanceof Error, "no error");
});

// --- the programs ------------------------------------------------------------

const run = (script: string, timeout = 300_000) =>
  spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout });

check("01 prints the version and the cold start", () => {
  const result = run("01_open.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("duckdb"), "version line");
  return expect(result.stdout.includes("cold start"), "cold start line");
});
check("02 generates a million rows", () => {
  const result = run("02_generate.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("1000000 rows"), result.stdout.slice(0, 200));
});
check("03 prints the seven groups and matches the arithmetic", () => {
  const result = run("03_aggregate.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("the sums match the arithmetic"), result.stdout.slice(-200));
});
check("04 writes both formats and refuses a larger parquet", () => {
  const result = run("04_parquet.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("9.6x smaller"), result.stdout.slice(0, 300));
});
check("05 measures the JavaScript baseline honestly", () => {
  const result = run("05_compare.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("rss"), "rss line");
  return expect(result.stdout.includes("499995000.00"), result.stdout.slice(-200));
});
check("the fixture generator writes the file the page reads", () => {
  const result = run("make_events.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("events.parquet"), result.stdout);
});

// --- run ---------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
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

  rmSync(dir, { recursive: true, force: true });

  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
