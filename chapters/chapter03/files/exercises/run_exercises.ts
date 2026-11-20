/**
 * The chapter 3 exercise harness: 48 checks over five exercises.
 *
 *   node chapters/chapter03/files/exercises/run_exercises.ts
 *   node chapters/chapter03/files/exercises/run_exercises.ts --only 5
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checks as ex1 } from "./ex1_repair_await.ts";
import { checks as ex2 } from "./ex2_budget.ts";
import { checks as ex3 } from "./ex3_measure_main_thread.ts";
import { checks as ex4 } from "./ex4_break.ts";
import { checks as ex5core } from "./queue_core.ts";
import { GOOD, checks as ex5record } from "./storage_record.ts";
import { eq, expect, runChecks, type Check } from "./selfcheck.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

const ex5wiring: readonly Check[] = [
  {
    name: "the wired program lists an inventory that fits",
    run: () => {
      const dir = mkdtempSync(join(tmpdir(), "zero-backend-ex5c-"));
      const path = join(dir, "inventory.json");
      writeFileSync(path, JSON.stringify(GOOD));

      const result = spawnSync(process.execPath, [join(ROOT, "ex5_capstone.ts"), path], {
        encoding: "utf8",
      });
      rmSync(dir, { recursive: true, force: true });

      eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
      expect(result.stdout.includes("store"), "should print the store");
      return expect(result.stdout.includes("queue"), "should print the queue");
    },
  },
];

const exercises: ReadonlyArray<{ id: number; title: string; checks: readonly Check[] }> = [
  { id: 1, title: "the write that was never awaited", checks: ex1 },
  { id: 2, title: "a budget that refuses the hundred and first file", checks: ex2 },
  { id: 3, title: "the work that was on the main thread all along", checks: ex3 },
  { id: 4, title: "the file that is bigger than the quota", checks: ex4 },
  {
    id: 5,
    title: "the capstone's first two rooms",
    checks: [...ex5core, ...ex5record, ...ex5wiring],
  },
];

const EXPECTED = { 1: 8, 2: 9, 3: 10, 4: 9, 5: 12 } as const;

async function main(argv: readonly string[]): Promise<number> {
  const onlyIndex = argv.indexOf("--only");
  const only = onlyIndex >= 0 ? Number(argv[onlyIndex + 1]) : null;
  const selected = only === null ? exercises : exercises.filter((e) => e.id === only);

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
    passed += await runChecks(String(exercise.id), exercise.checks);
    total += exercise.checks.length;
  }

  console.log("");
  console.log(`${passed}/${total} exercise checks passed`);
  return passed === total ? 0 : 1;
}

process.exit(await main(process.argv.slice(2)));
