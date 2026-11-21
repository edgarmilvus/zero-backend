/**
 * Chapter 20 harness: 56 assertions over the claims, the evidence and the coverage.
 *
 * This is the only harness in the book that reads the other chapters' outputs, which is the point: the
 * ledger is the book's test suite, and a claim whose record moved has to fail here.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLAIMS, byChapter, ids, type Claim } from "./claims.ts";
import { ROOT, assertComplete, coverage, resolve, verify } from "./ledger.ts";
import { assertVerdict, renderCoverage, renderTable } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };
const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => void checks.push({ name, run });

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}
function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
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

const RESULTS = CLAIMS.map(verify);
const VALUE = coverage();

// --- the claims ---------------------------------------------------------------

check("the book has twenty claims", () => eq(CLAIMS.length, 20, "claims"));
check("every chapter has exactly one claim", () => {
  const chapters = CLAIMS.map((claim) => claim.chapter).sort((left, right) => left - right);
  return eq(chapters.join(","), Array.from({ length: 20 }, (_unused, index) => index + 1).join(","), "chapters");
});
check("the ids are unique", () => eq(new Set(ids()).size, CLAIMS.length, "ids"));
check("the ids are c01 to c20", () => eq(ids()[0], "c01", "first") && eq(ids()[19], "c20", "last"));
check("every statement is a sentence", () => expect(CLAIMS.every((claim) => claim.statement.length > 20), "short"));
check("every evidence path is relative", () => expect(CLAIMS.every((claim) => !claim.evidence.startsWith("/")), "absolute"));
check("a claim may name a field and a floor", () => {
  const withField = CLAIMS.filter((claim) => claim.field !== undefined);
  return expect(withField.every((claim) => typeof claim.min === "number"), "field without floor");
});
check("byChapter returns the chapter's claim", () => eq(byChapter(14)[0]?.id, "c14", "id"));
check("byChapter returns nothing for a chapter with no claim", () => eq(byChapter(0).length, 0, "claims"));
check("the claim for chapter 8 names a throughput", () => eq(byChapter(8)[0]?.field, "megabytesPerSecond", "field"));
check("the claim for chapter 19 names the occurrence count", () => eq(byChapter(19)[0]?.field, "after", "field"));
check("the claim for chapter 20 points at the ledger itself", () =>
  expect(byChapter(20)[0]?.evidence.endsWith("claims.ts") === true, "evidence"),
);

// --- the paths and the records ------------------------------------------------

check("a path inside the repository resolves", () => expect(resolve("runs/chapter08/chunked-hash/record.json").startsWith(ROOT), "outside"));
check("a path that escapes is refused", () => {
  const error = throwsSync(() => resolve("../../etc/passwd"), "escape");
  return expect(error.message.includes("escapes"), error.message);
});
check("a missing record is a refusal, not a throw", () => {
  const verdict = verify({ id: "x", chapter: 8, statement: "missing", evidence: "runs/nope/record.json" });
  return expect(!verdict.ok && verdict.reason.includes("missing"), verdict.ok ? "ok" : verdict.reason);
});
check("a record from another chapter is refused", () => {
  const verdict = verify({ id: "x", chapter: 9, statement: "wrong chapter", evidence: "runs/chapter08/chunked-hash/record.json" });
  return expect(!verdict.ok && verdict.reason.includes("chapter"), verdict.ok ? "ok" : verdict.reason);
});
check("a non-JSON record is refused", () => {
  const verdict = verify({ id: "x", chapter: 20, statement: "not json", evidence: "chapters/chapter20/files/claims.ts", field: "x" });
  return expect(!verdict.ok, "ok");
});
check("a field that is not a number is refused", () => {
  const verdict = verify({ id: "x", chapter: 16, statement: "no field", evidence: "runs/chapter16/one-file-app/record.json", field: "nope", min: 0 });
  return expect(!verdict.ok && (verdict.reason.includes("not a number")), verdict.ok ? "ok" : verdict.reason);
});
check("a number under its floor is refused", () => {
  const verdict = verify({ id: "x", chapter: 16, statement: "under", evidence: "runs/chapter16/one-file-app/record.json", field: "bytes", min: 1_000_000 });
  return expect(!verdict.ok && verdict.reason.includes("under"), verdict.ok ? "ok" : verdict.reason);
});
check("a number over its floor passes with its value", () => {
  const verdict = verify({ id: "x", chapter: 16, statement: "over", evidence: "runs/chapter16/one-file-app/record.json", field: "bytes", min: 1 });
  return expect(verdict.ok && typeof verdict.value === "number" && verdict.value > 1, "value");
});
check("a nested field is read", () => {
  const verdict = verify({ id: "x", chapter: 10, statement: "nested", evidence: "runs/chapter10/analytics-in-a-tab/record.json", field: "node.parquetBytes", min: 1 });
  return expect(verdict.ok, verdict.ok ? "ok" : verdict.reason);
});
check("every claim with a record verifies", () => expect(RESULTS.every((result) => result.ok), "a claim failed"));

check("a claim with no field verifies by existence", () => {
  const verdict = verify({ id: "x", chapter: 20, statement: "file only", evidence: "chapters/chapter20/files/claims.ts" });
  return expect(verdict.ok, verdict.ok ? "ok" : verdict.reason);
});

// --- the coverage -------------------------------------------------------------

check("twenty chapters are covered", () => eq(VALUE.chaptersWithClaims, 20, "chapters"));
check("nothing is missing", () => eq(VALUE.missing.length, 0, "missing"));
check("the coverage counts the chapters that have claims", () => eq(VALUE.chaptersWithClaims, CLAIMS.length, "with claims"));
check("nothing failed", () => eq(VALUE.failed.length, 0, "failed"));
check("every claim is verified", () => eq(VALUE.verified, CLAIMS.length, "verified"));
check("a removed chapter is reported missing", () => {
  const partial = coverage(CLAIMS.filter((claim) => claim.chapter !== 7));
  return eq(partial.missing.join(","), "7", "missing");
});
check("a broken claim is counted as failed", () => {
  const partial = coverage([{ id: "x", chapter: 1, statement: "broken", evidence: "runs/nope.json" }], 1);
  return eq(partial.failed.length, 1, "failed");
});
check("coverage with fewer chapters needs fewer", () => eq(coverage(CLAIMS, 19).missing.length, 0, "missing"));
check("assertComplete passes on the book", () => expect(assertComplete(VALUE) === undefined, "threw"));

// --- the report ---------------------------------------------------------------

check("the table has a row per claim", () => eq(renderTable(CLAIMS, RESULTS).split("\n").length, CLAIMS.length + 1, "rows"));
check("a failed claim renders as FAILED", () => {
  const text = renderTable([{ ...CLAIMS[0]!, evidence: "runs/nope.json" }], [verify({ ...CLAIMS[0]!, evidence: "runs/nope.json" })]);
  return expect(text.includes("FAILED"), text);
});
check("the table names the chapter numbers", () => {
  const text = renderTable(CLAIMS, RESULTS);
  return expect(text.includes("     19") && text.includes("     20"), text.slice(0, 80));
});
check("the coverage rendering names the chapters", () => expect(renderCoverage(VALUE).includes("chapters          20"), renderCoverage(VALUE)));
check("a failed claim cannot be asserted as verified", () => {
  const error = throwsSync(() => assertVerdict(verify({ id: "x", chapter: 1, statement: "n", evidence: "runs/nope.json" }), true), "mismatch");
  return expect(error.message.includes("expected verified"), error.message);
});
check("a verified claim asserts as verified", () =>
  expect(assertVerdict(RESULTS[0]!, true) === undefined, "threw"),
);
check("a missing chapter makes assertComplete throw", () => {
  const error = throwsSync(() => assertComplete(coverage(CLAIMS.filter((claim) => claim.chapter !== 3))), "missing");
  return expect(error.message.includes("chapter"), error.message);
});

// --- the evidence, sampled per chapter ----------------------------------------

for (const chapter of [1, 4, 5, 6, 7, 9, 10, 12, 13, 15, 16, 18]) {
  check(`chapter ${chapter}'s record exists and verifies`, () => {
    const claim = byChapter(chapter)[0] as Claim;
    const verdict = verify(claim);
    return expect(verdict.ok, verdict.ok ? "ok" : verdict.reason);
  });
}

// --- the programs -------------------------------------------------------------

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("01 reads the whole ledger and asserts it", () => {
  const result = run("01_ledger.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("verified          20"), result.stdout.slice(-120));
});
check("02 refuses a moved file and an under-floor number", () => {
  const result = run("02_missing.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("missing"), "missing");
  return expect(result.stdout.includes("under"), "under");
});
check("03 shows a chapter missing from the coverage", () => {
  const result = run("03_coverage.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("missing 7"), result.stdout);
});
check("04 writes the ledger table", () => {
  const result = run("04_export.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("20 rows"), result.stdout);
});
check("05 writes the page's JSON", () => {
  const result = run("05_page.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("ledger.json"), result.stdout);
});

// --- run ----------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
    return 1;
  }
  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }
  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
