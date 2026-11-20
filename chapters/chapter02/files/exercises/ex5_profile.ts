/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * It decides three things and nothing else: which profile to read, which capability to ask
 * about, and what to print. The tier comes from core, the validation comes from the schema,
 * and this file contains no rule of its own.
 *
 *   node chapters/chapter02/files/exercises/ex5_profile.ts <profile.json>
 */

import { blocked, newCore, record, tierOf, verdictOf } from "./capability_core.ts";
import { normalize, readProfile } from "./profile_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_profile.ts <profile.json>");
    return 2;
  }

  let profile;
  try {
    profile = readProfile(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const meta = normalize(profile);
  const core = profile.capabilities.reduce(
    (accumulator, entry) =>
      record(accumulator, {
        id: entry.id,
        tier: entry.tier,
        verdict: entry.verdict as "present" | "blocked" | "absent" | "unknown",
      }),
    newCore(),
  );

  console.log(`profile          ${meta.engine}`);
  console.log(`measured at      ${meta.measuredAt}`);
  console.log(`isolated         ${meta.isolated}`);
  console.log(`tier from record ${meta.tier}`);
  console.log(`tier from core   ${tierOf(core)}`);
  console.log("");
  console.log(`threads          ${verdictOf(core, "threads")}`);
  console.log(
    `not present      ${blocked(core).length === 0 ? "none" : blocked(core).join(", ")}`,
  );

  if (tierOf(core) !== meta.tier) {
    console.error("");
    console.error(
      `the record claims tier ${meta.tier} and its own capabilities say ${tierOf(core)}`,
    );
    return 1;
  }

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
