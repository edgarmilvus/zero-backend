/**
 * The chapter 17 exercise harness: 48 checks over five exercises.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checks as ex1 } from "./ex1_redact.ts";
import { checks as ex2 } from "./ex2_whitelist.ts";
import { checks as ex3 } from "./ex3_triage.ts";
import { checks as ex4 } from "./ex4_version.ts";
import { checks as ex5core } from "./report_core.ts";
import { GOOD, checks as ex5record } from "./support_record.ts";
import { eq, expect, runChecks, type Check } from "./selfcheck.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

const ex5wiring: readonly Check[] = [
  {
    name: "the wired program prints the build, the bytes and the verdict",
    run: () => {
      const dir = mkdtempSync(join(tmpdir(), "zero-backend-ex5s-"));
      const path = join(dir, "support.json");
      writeFileSync(path, JSON.stringify(GOOD));
      const result = spawnSync(process.execPath, [join(ROOT, "ex5_support.ts"), path], { encoding: "utf8" });
      rmSync(dir, { recursive: true, force: true });
      eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
      expect(result.stdout.includes("category"), "category");
      return expect(result.stdout.includes("sendable"), "sendable");
    },
  },
];

const exercises: ReadonlyArray<{ id: number; title: string; checks: readonly Check[] }> = [
  { id: 1, title: "the report that quoted the note", checks: ex1 },
  { id: 2, title: "the blacklist that missed a field", checks: ex2 },
  { id: 3, title: "the triage that guessed", checks: ex3 },
  { id: 4, title: "the update that downgraded", checks: ex4 },
  { id: 5, title: "one report, one record", checks: [...ex5core, ...ex5record, ...ex5wiring] },
];

const EXPECTED = { 1: 8, 2: 9, 3: 10, 4: 9, 5: 12 } as const;

async function main(argv: readonly string[]): Promise<number> {
  const onlyIndex = argv.indexOf("--only");
  const only = onlyIndex >= 0 ? Number(argv[onlyIndex + 1]) : null;
  const selected = only === null ? exercises : exercises.filter((exercise) => exercise.id === only);
  if (selected.length === 0) {
    console.error(`no exercise ${only}`);
    return 2;
  }

  let passed = 0;
  let total = 0;
  for (const exercise of selected) {
    const expected = EXPECTED[exercise.id as keyof typeof EXPECTED];
    if (exercise.checks.length !== expected) {
      console.error(`exercise ${exercise.id} has ${exercise.checks.length} checks, the contract promises ${expected}`);
      return 1;
    }
    console.log(`\nexercise ${exercise.id} - ${exercise.title}`);
    passed += await runChecks(String(exercise.id), exercise.checks);
    total += exercise.checks.length;
  }

  console.log("");
  console.log(`${passed}/${total} exercise checks passed`);
  return passed === total ? 0 : 1;
}

process.exit(await main(process.argv.slice(2)));
