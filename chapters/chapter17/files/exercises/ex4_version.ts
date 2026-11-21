/**
 * Exercise 4 - the update that downgraded.
 *
 * A version comparison that sorts strings treats 1.10 as older than 1.9, and a file that accepts a
 * lower version is an update that can lose data written by the newer one.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Version = readonly [number, number, number];

export function parse(text: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (!match) throw new Error(`version: ${text} is not major.minor.patch`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compare(left: Version, right: Version): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return (left[index] as number) < (right[index] as number) ? -1 : 1;
  }
  return 0;
}

export function updates(current: string, candidate: string): boolean {
  return compare(parse(candidate), parse(current)) > 0;
}

export const checks: readonly Check[] = [
  { name: "1.10 is newer than 1.9 numerically", run: () => eq(updates("1.9.0", "1.10.0"), true, "newer") },
  { name: "a string sort says the opposite", run: () => expect(["1.10.0", "1.9.0"].sort()[0] === "1.10.0", "string") },
  { name: "a lower patch is not an update", run: () => eq(updates("1.9.1", "1.9.0"), false, "older") },
  { name: "the same version is not an update", run: () => eq(updates("1.9.0", "1.9.0"), false, "same") },
  { name: "a major bump is an update", run: () => eq(updates("1.9.0", "2.0.0"), true, "major") },
  { name: "a minor bump is an update", run: () => eq(updates("1.9.0", "1.10.0"), true, "minor") },
  { name: "compare is antisymmetric", run: () => eq(compare(parse("1.2.3"), parse("2.0.0")), -compare(parse("2.0.0"), parse("1.2.3")), "antisymmetry") },
  { name: "a version without three numbers is refused", run: () => {
    const error = throws(() => parse("1.2"), "short");
    return expect(error.message.includes("major.minor.patch"), error.message);
  } },
  { name: "a leading zero is a number and not a string", run: () => eq(compare(parse("01.2.0"), parse("1.2.0")), 0, "equal") },
];

export function main(): number {
  console.log(`1.10 > 1.9        ${updates("1.9.0", "1.10.0")}`);
  console.log(`string sort       ${["1.10.0", "1.9.0"].sort().join(" < ")}`);
  console.log("");
  console.log("a version is three numbers, and a string is not");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
