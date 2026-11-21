/**
 * Chapter 17 harness: 56 assertions over diagnostics, redaction, the report, triage and versions.
 *
 * The leak test is the chapter: a note with a phrase nobody else would write, an error message that
 * quotes it, and a report that must contain neither.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { collect, humanBytes, probeBrowser } from "./diagnostics.ts";
import { assertNoSecrets, redact, secretsOf } from "./redact.ts";
import { buildReport, checkReport, checksumOf, encodeReport, type SupportReport } from "./report.ts";
import { describe as describeTriage, triage } from "./triage.ts";
import { compare, isNewer, parseVersion, verdict } from "./update.ts";
import { renderBundle, renderReport, renderTriage } from "./render.ts";

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

const HEALTHY = collect({ storage: true, crypto: true, indexedDb: true, fileProtocol: true, storageBytes: 4_096 }, "1.4.0");

async function reportFor(probe: Parameters<typeof collect>[0], notes: number, message?: string, secrets: readonly string[] = []): Promise<SupportReport> {
  return buildReport({
    diagnostics: collect(probe, "1.4.0"),
    notes,
    tombstones: 0,
    ...(message === undefined ? {} : { error: { message, at: 1_700_000_000_000 } }),
    secrets,
  });
}

// --- the diagnostics ----------------------------------------------------------

check("a build id is required", () => {
  const error = throwsSync(() => collect({}, " "), "empty build");
  return expect(error.message.includes("build"), error.message);
});
check("the collected facts are the six whitelisted ones", () =>
  eq(Object.keys(HEALTHY).sort().join(","), "build,crypto,fileProtocol,indexedDb,storage,storageBytes", "keys"),
);
check("a probe that is false stays false", () => eq(collect({ storage: false }, "1.0.0").storage, false, "storage"));
check("a missing probe is false, not undefined", () => eq(collect({}, "1.0.0").crypto, false, "crypto"));
check("negative storage is clamped to zero", () => eq(collect({ storageBytes: -5 }, "1.0.0").storageBytes, 0, "bytes"));
check("fractional storage is floored", () => eq(collect({ storageBytes: 10.9 }, "1.0.0").storageBytes, 10, "bytes"));
check("the browser probe returns a shape", () => eq(typeof probeBrowser().storage, "boolean", "type"));
check("humanBytes formats kilobytes", () => eq(humanBytes(2_048), "2.0 kB", "kB"));
check("humanBytes formats bytes", () => eq(humanBytes(17), "17 B", "B"));

// --- the redaction ------------------------------------------------------------

const NOTES = [{ title: "Safe combination", body: "the spare key is under the blue pot" }];
const SECRETS = secretsOf(NOTES);

check("a title longer than three characters is a secret", () => expect(SECRETS.includes("Safe combination"), "title"));
check("a distinctive word is a secret", () => expect(SECRETS.includes("spare"), SECRETS.join(",")));
check("a short common word is not", () => expect(!SECRETS.includes("the"), "the"));
check("longer secrets come first", () => expect(SECRETS[0]!.length >= SECRETS[SECRETS.length - 1]!.length, "order"));
check("redaction replaces the title", () =>
  expect(redact('note "Safe combination" failed', SECRETS).includes("[redacted]"), "title"),
);
check("redaction is case-insensitive", () => expect(!redact("SAFE COMBINATION", SECRETS).toLowerCase().includes("safe combination"), "case"));
check("redaction leaves the rest readable", () => expect(redact("note failed", SECRETS).includes("failed"), "text"));
check("a regex character in a secret is literal", () => {
  const secrets = secretsOf([{ title: "a.b*c", body: "" }]);
  return expect(redact("x a.b*c y", secrets).includes("[redacted]"), "regex");
});
check("redaction handles an empty list", () => eq(redact("nothing", []), "nothing", "text"));
check("a leak is an error", () => {
  const error = throwsSync(() => assertNoSecrets("the spare key", SECRETS), "leak");
  return expect(error.message.includes("leaked"), error.message);
});
check("a clean report passes", () => expect(assertNoSecrets("counts 3", SECRETS) === undefined, "threw"));
check("a two-character secret is ignored by the check", () => expect(assertNoSecrets("the", ["ab"]) === undefined, "threw"));

// --- the report ---------------------------------------------------------------

const REPORT = await reportFor({ storage: true, crypto: true, storageBytes: 100 }, 3, "note failed");

check("a report has the six fields", () =>
  eq(Object.keys(REPORT).sort().join(","), "build,checksum,counts,env,error,v", "keys"),
);
check("the checksum is 64 hex characters", () => expect(/^[0-9a-f]{64}$/.test(REPORT.checksum), REPORT.checksum));
check("the checksum covers the content", async () => {
  const { checksum, ...body } = REPORT;
  return eq(await checksumOf(body), checksum, "checksum");
});
check("a changed count breaks the checksum", async () => {
  const tampered = { ...REPORT, counts: { notes: 99, tombstones: 0 } };
  const result = await checkReport(tampered);
  return expect(!result.ok && (result.reason ?? "").includes("checksum"), result.ok ? "ok" : (result.reason ?? "no reason"));
});
check("a missing field is refused", async () => {
  const result = await checkReport({ v: 1, build: "x" });
  return expect(!result.ok, "ok");
});
check("an unknown version is refused", async () => {
  const result = await checkReport({ ...REPORT, v: 2 });
  return expect(!result.ok, "ok");
});
check("a good report passes the recipient check", async () => {
  const result = await checkReport(JSON.parse(JSON.stringify(REPORT)));
  return expect(result.ok, result.reason ?? "no reason");
});
check("an error message is redacted", async () => {
  const value = await reportFor({ storage: true }, 1, "could not open Safe combination", SECRETS);
  return expect(!JSON.stringify(value).includes("Safe combination"), JSON.stringify(value));
});
check("a negative note count is refused", async () => {
  try {
    await reportFor({ storage: true }, -1);
    throw new Error("accepted");
  } catch (error) {
    return expect((error as Error).message.includes("count"), (error as Error).message);
  }
});
check("the encoded report is canonical", () => {
  const encoded = encodeReport(REPORT);
  return expect(encoded.startsWith('{"build":'), encoded.slice(0, 20));
});
check("the report contains no document", () =>
  expect(!encodeReport(REPORT).includes("body"), "body field"),
);

// --- the triage ---------------------------------------------------------------

check("no storage is a blocker", async () => eq(triage(await reportFor({ storage: false }, 3)).severity, "blocker", "severity"));
check("notes zero with bytes used means the store was not read", async () =>
  eq(triage(await reportFor({ storage: true, storageBytes: 4_096 }, 0)).category, "store-not-read", "category"),
);
check("a missing crypto is high", async () => eq(triage(await reportFor({ storage: true, crypto: false }, 3)).severity, "high", "severity"));
check("an import failure is an import-failed", async () =>
  eq(triage(await reportFor({ storage: true, crypto: true }, 3, "the notes were changed after the file was sealed")).category, "import-failed", "category"),
);
check("an expired share is a share-expired", async () =>
  eq(triage(await reportFor({ storage: true, crypto: true }, 3, "the permission expired at 2026")).category, "share-expired", "category"),
);
check("anything else is unknown", async () => eq(triage(await reportFor({ storage: true, crypto: true }, 3)).category, "unknown", "category"));
check("storage is checked before crypto", async () => {
  const value = await reportFor({ storage: false, crypto: false }, 3);
  return eq(triage(value).category, "no-storage", "order");
});
check("every triage has a first action", async () => {
  const value = triage(await reportFor({ storage: true, crypto: true }, 3));
  return expect(value.firstAction.length > 20, value.firstAction);
});
check("the triage renders as one line", async () => {
  const text = renderTriage(triage(await reportFor({ storage: true, crypto: true }, 3)));
  return expect(text.includes("unknown"), text);
});

// --- the versions -------------------------------------------------------------

check("a version parses three numbers", () => eq(parseVersion("1.4.0").minor, 4, "minor"));
check("a version without three numbers is refused", () => {
  const error = throwsSync(() => parseVersion("1.4"), "short");
  return expect(error.message.includes("major.minor.patch"), error.message);
});
check("1.10 is newer than 1.9", () => eq(isNewer(parseVersion("1.10.0"), parseVersion("1.9.0")), true, "newer"));
check("a string sort gets it backwards", () => expect(["1.10.0", "1.9.0"].sort()[0] === "1.10.0", "string order"));
check("a lower version is older", () => eq(verdict("1.9.0", "1.8.9"), "older", "verdict"));
check("an equal version is the same", () => eq(verdict("1.9.0", "1.9.0"), "same", "verdict"));
check("a major bump is newer", () => eq(verdict("1.9.0", "2.0.0"), "newer", "verdict"));

// --- the rendering and the programs -------------------------------------------

check("the bundle contains the triage and the checksum", async () => {
  const value = await reportFor({ storage: true, crypto: true }, 3);
  const html = renderBundle(value, triage(value));
  expect(html.includes(value.checksum.slice(0, 24)), "checksum");
  return expect(html.includes("Support report"), "title");
});
check("the bundle has no note body", async () => {
  const value = await reportFor({ storage: true }, 1, "failed", SECRETS);
  const html = renderBundle(value, triage(value));
  return expect(!html.includes("blue pot"), "body");
});
check("the report rendering names the build", () => expect(renderReport(REPORT).includes("1.4.0"), "build"));

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("01 builds a report the recipient accepts", () => {
  const result = run("01_report.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("recipient check   ok"), result.stdout);
});
check("02 leaks nothing", () => {
  const result = run("02_leak.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("secret present    false"), result.stdout);
});
check("03 gives five distinct categories", () => {
  const result = run("03_triage.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("5 distinct of 5"), result.stdout);
});
check("04 refuses the downgrade", () => {
  const result = run("04_update.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("1.8.9    older"), result.stdout);
});
check("05 writes a bundle with no note text", () => {
  const result = run("05_bundle.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("secret present    false"), result.stdout);
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
