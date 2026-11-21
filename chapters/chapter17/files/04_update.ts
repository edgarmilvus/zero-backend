/**
 * Example 4 - versions, and the downgrade a file must refuse.
 *
 *   node chapters/chapter17/files/04_update.ts
 */

import { compare, isNewer, parseVersion, verdict } from "./update.ts";

export function main(): number {
  const current = "1.9.0";
  console.log(`current           ${current}`);
  for (const candidate of ["1.9.0", "1.10.0", "1.8.9", "2.0.0"]) {
    console.log(`${candidate.padEnd(8)} ${verdict(current, candidate)}`);
  }

  const sorted = ["1.10.0", "1.9.0", "1.2.0"].map(parseVersion).sort(compare);
  console.log("");
  console.log(`numeric order     ${sorted.map((value) => `${value.major}.${value.minor}.${value.patch}`).join(" < ")}`);
  console.log(`a string sort     ${["1.10.0", "1.9.0", "1.2.0"].sort().join(" < ")}`);
  console.log("");
  console.log(`1.10 is newer than 1.9: ${isNewer(parseVersion("1.10.0"), parseVersion("1.9.0"))}`);

  return isNewer(parseVersion("1.10.0"), parseVersion("1.9.0")) && verdict(current, "1.8.9") === "older" ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
