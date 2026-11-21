/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 *   node chapters/chapter14/files/exercises/ex5_cap.ts <cap.json>
 */

import { describe, parse, subset } from "./scope_core.ts";
import { normalize, readCap } from "./cap_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_cap.ts <cap.json>");
    return 2;
  }

  let record;
  try {
    record = readCap(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const scope = parse(record.scope);

  console.log(`issuer           ${record.issuer.slice(0, 16)}...`);
  console.log(`scope            ${describe(scope)}, ${numbers.pairs} pair(s)`);
  console.log(`expires          in ${numbers.minutesLeft} minute(s)`);
  console.log(`verdict          ${record.verdict}`);
  console.log(`self-check       ${subset(scope, scope) ? "the scope contains itself" : "impossible"}`);

  return record.verdict === "allowed" ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
