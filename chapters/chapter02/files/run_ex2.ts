/**
 * Chapter 2 harness: 52 assertions on the probe.
 *
 * The interesting cases here are the ones a real machine will not produce on demand:
 * SharedArrayBuffer without isolation, a capability nobody probed, a profile from an engine
 * that has nothing. They are constructed, and that is the reason `detectCapabilities` takes
 * its environment as a parameter.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CAPABILITIES, byTier, chapterNeeds, type CapabilityId } from "./capabilities.ts";
import { detectCapabilities } from "./detect.ts";
import {
  chaptersThatRun,
  formatVerdict,
  highestTier,
  probe,
  type Capabilities,
  type Profile,
} from "./probe.ts";
import {
  assertTwelveCapabilities,
  assertVerdictsNotGuessed,
  renderJson,
  renderMarkdown,
  renderTable,
} from "./report.ts";

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

function throws(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

const ALL: Record<CapabilityId, boolean> = {
  workers: true,
  "offscreen-canvas": true,
  indexeddb: true,
  "compression-streams": true,
  wasm: true,
  "wasm-streaming": true,
  threads: true,
  webcodecs: true,
  opfs: true,
  "opfs-sync": true,
  webgpu: true,
  "file-system-access": true,
};

const NOTHING: Record<CapabilityId, boolean> = Object.fromEntries(
  Object.keys(ALL).map((key) => [key, false]),
) as Record<CapabilityId, boolean>;

const full: Capabilities = {
  crossOriginIsolated: true,
  sharedArrayBuffer: true,
  present: ALL,
};

const empty: Capabilities = {
  crossOriginIsolated: false,
  sharedArrayBuffer: false,
  present: NOTHING,
};

const isolationOnly: Capabilities = { ...empty, sharedArrayBuffer: true };
const noWorker: Capabilities = { ...full, present: { ...ALL, workers: false } };
const noCodecs: Capabilities = { ...full, present: { ...ALL, webcodecs: false } };
const neverProbed: Capabilities = { ...full, present: { ...ALL, webcodecs: undefined } };

const profileOf = (caps: Capabilities): Profile => probe(caps);
const verdict = (profile: Profile, id: CapabilityId) =>
  profile.reports.find((report) => report.id === id)?.verdict;

// --- the list ---------------------------------------------------------------

check("the list has twelve capabilities", () => eq(CAPABILITIES.length, 12, "length"));
check("the ids are unique", () =>
  eq(new Set(CAPABILITIES.map((c) => c.id)).size, 12, "unique ids"),
);
check("every capability sits on a rung between 1 and 3", () =>
  expect(
    CAPABILITIES.every((c) => c.tier >= 1 && c.tier <= 3),
    "a capability with tier 0 would mean nothing",
  ),
);
check("byTier returns four rungs", () => eq(byTier().length, 4, "rungs"));
check("the rungs hold all twelve between them", () =>
  eq(
    byTier().reduce((sum, rung) => sum + rung.length, 0),
    12,
    "total",
  ),
);
check("rung 1 holds four capabilities", () => eq(byTier()[1]?.length, 4, "tier 1"));
check("rung 2 holds four capabilities", () => eq(byTier()[2]?.length, 4, "tier 2"));
check("rung 3 holds four capabilities", () => eq(byTier()[3]?.length, 4, "tier 3"));
check("every fallback says something a reader can do", () =>
  expect(
    CAPABILITIES.every((c) => c.fallback.trim().length > 20),
    "a fallback shorter than a sentence is not a fallback",
  ),
);
check("every capability names a chapter of this book", () =>
  expect(
    CAPABILITIES.every((c) => Number.isInteger(c.chapter) && c.chapter >= 1 && c.chapter <= 20),
    "chapter out of range",
  ),
);

// --- verdicts ---------------------------------------------------------------

check("a machine with everything reaches tier 3", () => eq(profileOf(full).tier, 3, "tier"));
check("a machine with nothing reaches tier 0", () => eq(profileOf(empty).tier, 0, "tier"));
check("threads are blocked when isolation is missing", () =>
  eq(verdict(profileOf(isolationOnly), "threads"), "blocked", "verdict"),
);
check("threads are absent when the engine has no SharedArrayBuffer", () =>
  eq(verdict(profileOf(empty), "threads"), "absent", "verdict"),
);
check("threads are present with isolation, the buffer and a worker", () =>
  eq(verdict(profileOf(full), "threads"), "present", "verdict"),
);
check("a blocked capability appears in the gaps", () =>
  expect(
    profileOf(isolationOnly).gaps.some((gap) => gap.id === "threads"),
    "threads should be a gap",
  ),
);
check("the blocked thread verdict names the headers", () => {
  const report = profileOf(isolationOnly).reports.find((r) => r.id === "threads");
  return expect(report?.why.includes("COOP") === true, String(report?.why));
});
check("a capability nobody probed is unknown", () =>
  eq(verdict(profileOf(neverProbed), "webcodecs"), "unknown", "verdict"),
);
check("unknown does not raise the tier", () =>
  eq(profileOf(neverProbed).tier < profileOf(full).tier, true, "tier should drop"),
);
check("a capability whose dependency is missing is blocked", () => {
  const report = profileOf(noWorker).reports.find((r) => r.id === "offscreen-canvas");
  expect(report?.verdict === "blocked", String(report?.verdict));
  return expect(report?.why.includes("workers") === true, String(report?.why));
});
check("blocked chapters are unique and sorted", () => {
  const chapters = profileOf(noWorker).blockedChapters;
  eq(new Set(chapters).size, chapters.length, "unique");
  return eq([...chapters].sort((a, b) => a - b).join(","), chapters.join(","), "sorted");
});
check("the four verdicts have four words", () =>
  eq(
    ["present", "blocked", "absent", "unknown"].map((v) => formatVerdict(v as never)).join("/"),
    "yes/blocked/no/unknown",
    "words",
  ),
);

// --- tiers ------------------------------------------------------------------

check("one missing rung 1 capability keeps the machine at tier 0", () => {
  const noIndexed: Capabilities = { ...full, present: { ...ALL, indexeddb: false } };
  return eq(profileOf(noIndexed).tier, 0, "tier");
});
check("a complete rung 1 with one rung 2 gap is tier 1", () => eq(profileOf(noCodecs).tier, 1, "tier"));
check("the tier is cumulative, not the highest single capability", () => {
  const onlyGpu: Capabilities = { ...empty, present: { ...NOTHING, webgpu: true } };
  return eq(profileOf(onlyGpu).tier, 0, "tier");
});
check("highestTier stops at an unknown", () => {
  const reports = profileOf(neverProbed).reports;
  return eq(highestTier(reports), 1, "tier");
});
check("the tier never exceeds three", () => eq(profileOf(full).tier <= 3, true, "bound"));
check("a missing rung 3 capability does not lower the rung 2 result", () => {
  const noGpu: Capabilities = { ...full, present: { ...ALL, webgpu: false } };
  return eq(profileOf(noGpu).tier, 2, "tier");
});

// --- the chapter matrix -----------------------------------------------------

const matrix = chaptersThatRun(profileOf(full));

check("the matrix has one row per chapter that has a requirement", () =>
  eq(matrix.length, chapterNeeds().size, "rows"),
);
check("on a complete machine every chapter runs", () =>
  expect(matrix.every((row) => row.ok), "a chapter should degrade"),
);
check("a degraded row lists what is missing", () => {
  const row = chaptersThatRun(profileOf(noCodecs)).find((r) => r.chapter === 5);
  return eq(row?.missing.join(","), "webcodecs", "missing");
});
check("chapter four degrades without threads", () => {
  const row = chaptersThatRun(profileOf(isolationOnly)).find((r) => r.chapter === 4);
  return eq(row?.ok, false, "ok");
});
check("the matrix is sorted by chapter", () =>
  eq(
    matrix.map((row) => row.chapter).join(","),
    [...matrix].map((row) => row.chapter).sort((a, b) => a - b).join(","),
    "order",
  ),
);
check("chapter 2 is not in its own matrix", () =>
  expect(!matrix.some((row) => row.chapter === 2), "chapter 2 has no requirement"),
);

// --- detection --------------------------------------------------------------

check("an empty environment detects nothing", () => {
  const caps = detectCapabilities({});
  return expect(
    Object.values(caps.present).every((value) => value === false),
    "found something in an empty object",
  );
});
check("a Worker global is detected by type", () =>
  eq(detectCapabilities({ Worker: () => {} }).present.workers, true, "workers"),
);
check("wasm needs a validate that answers true", () =>
  eq(detectCapabilities({ WebAssembly: { validate: () => true } }).present.wasm, true, "wasm"),
);
check("wasm is false when validate is missing", () =>
  eq(detectCapabilities({ WebAssembly: {} }).present.wasm, false, "wasm"),
);
check("opfs needs navigator.storage.getDirectory", () =>
  eq(
    detectCapabilities({ navigator: { storage: { getDirectory: () => {} } } }).present.opfs,
    true,
    "opfs",
  ),
);
check("opfs-sync is false without opfs", () =>
  eq(detectCapabilities({ FileSystemFileHandle: { prototype: {} } }).present["opfs-sync"], false, "opfs-sync"),
);
check("webgpu is detected through navigator.gpu", () =>
  eq(detectCapabilities({ navigator: { gpu: {} } }).present.webgpu, true, "webgpu"),
);
check("isolation is false unless the flag is exactly true", () => {
  eq(detectCapabilities({}).crossOriginIsolated, false, "default");
  return eq(detectCapabilities({ crossOriginIsolated: true }).crossOriginIsolated, true, "flag");
});

// --- the three renderings ---------------------------------------------------

check("the table has one line per capability", () => {
  const lines = renderTable(profileOf(full)).split("\n");
  return eq(lines.filter((line) => line.startsWith("1 ") || line.startsWith("2 ") || line.startsWith("3 ")).length, 12, "rows");
});
check("the markdown header is the five columns", () =>
  eq(
    renderMarkdown(profileOf(full)).split("\n")[0],
    "| tier | capability | verdict | chapter | what the book does instead |",
    "header",
  ),
);
check("the json record parses and holds twelve capabilities", () => {
  const raw = JSON.parse(
    renderJson(profileOf(full), {
      measuredAt: "2026-11-20T00:00:00.000Z",
      engine: "node",
      crossOriginIsolated: true,
      userAgent: "test",
    }),
  ) as { capabilities: unknown[]; tier: number };
  eq(raw.capabilities.length, 12, "capabilities");
  return eq(raw.tier, 3, "tier");
});
check("twelve capabilities pass their own assertion", () =>
  expect(assertTwelveCapabilities(profileOf(full)) === undefined, "should not throw"),
);
check("eleven capabilities are refused", () => {
  const short = { ...profileOf(full), reports: profileOf(full).reports.slice(1) };
  const error = throws(() => assertTwelveCapabilities(short), "short profile");
  return expect(error.message.includes("11"), error.message);
});
check("a probed profile never claims an unprobed capability", () =>
  expect(assertVerdictsNotGuessed(profileOf(full), full) === undefined, "should not throw"),
);
check("a verdict without a probe is refused", () => {
  const error = throws(
    () => assertVerdictsNotGuessed(profileOf(full), neverProbed),
    "guessed verdict",
  );
  return expect(error.message.includes("webcodecs"), error.message);
});
check("the table prints the rung reached", () =>
  expect(renderTable(profileOf(full)).includes("tier reached      3 of 3"), "footer"),
);

// --- the programs, run as a reader runs them --------------------------------

check("01 probes this node and prints a tier", () => {
  const result = spawnSync(process.execPath, [join(ROOT, "01_detect_here.ts")], { encoding: "utf8" });
  eq(result.status, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("tier reached"), "should print the tier");
});
check("05 shows that unknown and false are different answers", () => {
  const result = spawnSync(process.execPath, [join(ROOT, "05_unknown_is_not_false.ts")], { encoding: "utf8" });
  eq(result.status, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("different answer"), "should compare the two tiers");
});

// --- run --------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 52) {
    console.error(`harness has ${checks.length} checks, the contract promises 52`);
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
