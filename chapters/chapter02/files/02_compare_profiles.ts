/**
 * Example 2 - two machines, one table.
 *
 *   node chapters/chapter02/files/02_compare_profiles.ts a.json b.json
 *
 * The team has two laptops and one of them cannot run chapter 5. The comparison is what
 * turns "it works on my machine" into a list of capabilities that differ, which is the only
 * form of that sentence anybody can act on.
 */

import { readFileSync } from "node:fs";
import { formatVerdict } from "./probe.ts";
import type { Verdict } from "./probe.ts";

export type ProfileFile = {
  readonly engine: string;
  readonly capabilities: readonly { readonly id: string; readonly verdict: Verdict }[];
};

export function readProfileFile(path: string): ProfileFile {
  const raw = JSON.parse(readFileSync(path, "utf8")) as ProfileFile;
  if (!Array.isArray(raw.capabilities)) {
    throw new Error(`${path}: capabilities is not an array`);
  }
  return raw;
}

const WIDTH = 26;

export function main(argv: readonly string[]): number {
  const [a, b] = argv;
  if (!a || !b) {
    console.error("usage: 02_compare_profiles.ts a.json b.json");
    return 2;
  }

  let left: ProfileFile;
  let right: ProfileFile;
  try {
    left = readProfileFile(a);
    right = readProfileFile(b);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const rightById = new Map(right.capabilities.map((entry) => [entry.id, entry.verdict]));

  console.log(`${left.engine.padEnd(20)} ${right.engine}`);
  console.log("");

  let differences = 0;
  for (const entry of left.capabilities) {
    const other = rightById.get(entry.id);
    if (other === undefined) {
      console.log(`${entry.id.padEnd(WIDTH)} only in ${left.engine}`);
      differences += 1;
      continue;
    }
    if (other === entry.verdict) continue;
    differences += 1;
    console.log(
      `${entry.id.padEnd(WIDTH)} ${formatVerdict(entry.verdict).padEnd(9)} ${
        formatVerdict(other)
      }`,
    );
  }

  console.log("");
  console.log(
    differences === 0
      ? "no difference: the two profiles agree on all twelve"
      : `${differences} capabilities differ`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
