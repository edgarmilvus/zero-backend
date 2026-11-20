/**
 * The chapter 2 exercise harness: 48 checks over five exercises.
 *
 *   node chapters/chapter02/files/exercises/run_exercises.ts
 *   node chapters/chapter02/files/exercises/run_exercises.ts --only 3
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checks as ex1 } from "./ex1_repair_threads.ts";
import { checks as ex2 } from "./ex2_tier.ts";
import { checks as ex3 } from "./ex3_probe_not_sniff.ts";
import { checks as ex4 } from "./ex4_break.ts";
import { checks as ex5core } from "./capability_core.ts";
import { GOOD, checks as ex5record } from "./profile_record.ts";
import { eq, expect, runChecks, type Check } from "./selfcheck.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

const PROFILE = {
  ...GOOD,
  capabilities: [
    { id: "workers", tier: 1, verdict: "present" },
    { id: "wasm", tier: 2, verdict: "present" },
    { id: "threads", tier: 2, verdict: "blocked" },
    { id: "webgpu", tier: 3, verdict: "present" },
  ],
  tier: 1,
};

const ex5wiring: readonly Check[] = [
  {
    name: "the wired program reads a profile and prints its tier and gaps",
    run: () => {
      const dir = mkdtempSync(join(tmpdir(), "zero-backend-ex5b-"));
      const path = join(dir, "profile.json");
      writeFileSync(path, JSON.stringify(PROFILE));

      const result = spawnSync(process.execPath, [join(ROOT, "ex5_profile.ts"), path], {
        encoding: "utf8",
      });
      rmSync(dir, { recursive: true, force: true });

      eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
      expect(result.stdout.includes("tier from core"), "should print the core's tier");
      return expect(result.stdout.includes("threads"), "should report threads");
    },
  },
];

const exercises: ReadonlyArray<{ id: number; title: string; checks: readonly Check[] }> = [
  { id: 1, title: "the thread test that says yes on a page with no headers", checks: ex1 },
  { id: 2, title: "a tier computed from the wrong direction", checks: ex2 },
  { id: 3, title: "the probe that sniffs instead of probing", checks: ex3 },
  { id: 4, title: "the profile that only knows one machine", checks: ex4 },
  {
    id: 5,
    title: "one profile per chapter, one comparison",
    checks: [...ex5core, ...ex5record, ...ex5wiring],
  },
];

const EXPECTED = { 1: 8, 2: 9, 3: 10, 4: 9, 5: 12 } as const;

function main(argv: readonly string[]): number {
  const onlyIndex = argv.indexOf("--only");
  const only = onlyIndex >= 0 ? Number(argv[onlyIndex + 1]) : null;
  const selected =
    only === null ? exercises : exercises.filter((exercise) => exercise.id === only);

  if (selected.length === 0) {
    console.error(`no exercise ${only}`);
    return 2;
  }

  let passed = 0;
  let total = 0;

  for (const exercise of selected) {
    const expected = EXPECTED[exercise.id as keyof typeof EXPECTED];
    if (exercise.checks.length !== expected) {
      console.error(
        `exercise ${exercise.id} has ${exercise.checks.length} checks, the contract promises ${expected}`,
      );
      return 1;
    }
    console.log(`\nexercise ${exercise.id} - ${exercise.title}`);
    passed += runChecks(String(exercise.id), exercise.checks);
    total += exercise.checks.length;
  }

  console.log("");
  console.log(`${passed}/${total} exercise checks passed`);
  return passed === total ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
