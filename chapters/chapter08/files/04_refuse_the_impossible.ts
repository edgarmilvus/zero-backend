/**
 * Example 4 - the file that cannot be held, refused before it is opened.
 *
 *   node chapters/chapter08/files/04_refuse_the_impossible.ts
 *
 * A 6 GB file, a 2.5 GB file and a 200 MB file against a 4 GiB address space and a 1 GB budget. The
 * answer is a refusal with three fields, and the difference between the two ceilings is the point.
 */

import { ADDRESS_SPACE_BYTES, refuseIfTooBig, estimatePeakBytes } from "./plan.ts";

const SPACE = { limitBytes: ADDRESS_SPACE_BYTES, budgetBytes: 1 * 1e9 };

export function main(): number {
  for (const size of [6e9, 2.5e9, 200e6]) {
    const refusal = refuseIfTooBig(size, SPACE);
    const label = `${(size / 1e9).toFixed(1)} GB`;
    console.log(`${label.padEnd(8)} peak ${(estimatePeakBytes(size) / 1e9).toFixed(1)} GB`);
    if (!refusal) {
      console.log("         fits the address space and the budget");
      continue;
    }
    console.log(`         REFUSED: ${refusal.reason}`);
    console.log(`         ceiling: ${refusal.ceiling}`);
    console.log(`         fallback: chapter ${refusal.fallbackChapter}`);
  }

  console.log("");
  console.log("two different walls: the address space cannot be raised, and the budget is a policy");
  console.log("a refusal that does not say which is a refusal a support agent cannot act on");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
