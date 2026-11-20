/**
 * The exercise harness: 48 checks over five exercises.
 *
 *   node chapters/chapter01/files/exercises/run_exercises.ts
 *   node chapters/chapter01/files/exercises/run_exercises.ts --only 5
 *
 * The selector exists because a reader who is working on exercise 4 should not
 * wait for the other four. The combined run is the gate; the selector is the
 * instrument.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COLUMNS } from "../report.ts";
import { checks as ex1 } from "./ex1_egress_twice.ts";
import { checks as ex2 } from "./ex2_photobatch.ts";
import { checks as ex3 } from "./ex3_measure_not_formula.ts";
import { checks as ex4 } from "./ex4_say_no.ts";
import { checks as ex5core } from "./ledger_core.ts";
import { GOOD, checks as ex5record } from "./ledger_record.ts";
import { eq, expect, runChecks, type Check } from "./selfcheck.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

/** The one check that needs all three files of exercise 5, wired together. */
const ex5wiring: readonly Check[] = [
  {
    name: "the wired program prints the five columns from a record on disk",
    run: () => {
      const dir = mkdtempSync(join(tmpdir(), "zero-backend-ex5-"));
      const path = join(dir, "record.json");
      writeFileSync(path, JSON.stringify(GOOD));

      const result = spawnSync(process.execPath, [join(ROOT, "ex5_ledger.ts"), path], {
        encoding: "utf8",
      });
      rmSync(dir, { recursive: true, force: true });

      eq(result.status ?? -1, 0, `exit code (${result.stderr})`);
      return expect(
        result.stdout.includes(`| ${COLUMNS.join(" | ")} |`),
        "should print the table",
      );
    },
  },
];

const exercises: ReadonlyArray<{ id: number; title: string; checks: readonly Check[] }> = [
  { id: 1, title: "the tariff that counts egress twice", checks: ex1 },
  { id: 2, title: "a second workload: the four-thousand-photo batch", checks: ex2 },
  { id: 3, title: "the client number is not a formula", checks: ex3 },
  { id: 4, title: "the workload the client cannot do", checks: ex4 },
  {
    id: 5,
    title: "one ledger for twenty chapters",
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
