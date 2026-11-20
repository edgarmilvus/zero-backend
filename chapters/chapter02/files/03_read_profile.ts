/**
 * Example 3 - read a profile, and find what it does not say.
 *
 *   node chapters/chapter02/files/03_read_profile.ts runs/chapter02/<id>/profile.json
 *
 * A profile without an engine, a date and the isolation flag is not comparable with
 * anything, so this prints those three before it prints a single verdict.
 */

import { formatVerdict } from "./probe.ts";
import { readProfileFile, type ProfileFile } from "./02_compare_profiles.ts";

type FullProfile = ProfileFile & {
  readonly measuredAt?: string;
  readonly crossOriginIsolated?: boolean;
  readonly tier?: number;
};

const REQUIRED = ["measuredAt", "engine", "crossOriginIsolated", "tier"] as const;

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: 03_read_profile.ts <profile.json>");
    return 2;
  }

  let profile: FullProfile;
  try {
    profile = readProfileFile(path) as FullProfile;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const missing = REQUIRED.filter((field) => profile[field] === undefined);
  if (missing.length > 0) {
    console.error(`${path}: missing ${missing.join(", ")}`);
    console.error("  a profile without these cannot be compared with another machine");
    return 1;
  }

  console.log(`record           ${path}`);
  console.log(`measured at      ${profile.measuredAt}`);
  console.log(`engine           ${profile.engine}`);
  console.log(`isolated         ${profile.crossOriginIsolated}`);
  console.log(`tier             ${profile.tier} of 3`);
  console.log("");

  const notPresent = profile.capabilities.filter((entry) => entry.verdict !== "present");
  if (notPresent.length === 0) {
    console.log("all twelve capabilities are present on this machine");
    return 0;
  }

  console.log(`${notPresent.length} of ${profile.capabilities.length} are not present:`);
  for (const entry of notPresent) {
    console.log(`  ${entry.id.padEnd(26)} ${formatVerdict(entry.verdict)}`);
  }
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
