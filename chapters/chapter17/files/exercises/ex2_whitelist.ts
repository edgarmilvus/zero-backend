/**
 * Exercise 2 - the blacklist that missed a field.
 *
 * Redacting known keys creates a report that grows a field nobody classified: someone adds `lastTitle`
 * and it ships. A whitelist inverts the default: a field that is not named never leaves.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export const ALLOWED = ["build", "notes", "storage", "crypto"] as const;

/** The bug: copy everything and delete the known-bad keys. */
export function blacklist(source: Record<string, unknown>): Record<string, unknown> {
  const out = { ...source };
  for (const key of ["body", "title", "notes"]) delete out[key];
  return out;
}

/** The repair: copy only the keys that are allowed. */
export function whitelist(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

const SOURCE = { build: "1.4.0", notes: 3, storage: true, crypto: true, lastTitle: "Groceries", body: "milk" };

export const checks: readonly Check[] = [
  { name: "the blacklist drops the known keys", run: () => {
    const out = blacklist(SOURCE);
    return expect(!("body" in out) && !("title" in out), JSON.stringify(out));
  } },
  { name: "the blacklist keeps the field nobody classified", run: () => expect("lastTitle" in blacklist(SOURCE), "kept") },
  { name: "the whitelist keeps only the allowed keys", run: () => eq(Object.keys(whitelist(SOURCE)).sort().join(","), "build,crypto,notes,storage", "keys") },
  { name: "the whitelist drops the unclassified field", run: () => expect(!("lastTitle" in whitelist(SOURCE)), "kept") },
  { name: "the whitelist drops the body", run: () => expect(!("body" in whitelist(SOURCE)), "kept") },
  { name: "a missing allowed key is simply absent", run: () => expect(!("build" in whitelist({ notes: 1 })), "invented") },
  { name: "the whitelist preserves values", run: () => eq(whitelist(SOURCE).notes, 3, "value") },
  { name: "a nested object is not deep-copied by the whitelist", run: () => expect(whitelist({ build: "1", env: { a: 1 } }).env === undefined, "env") },
  { name: "an empty source gives an empty report", run: () => eq(Object.keys(whitelist({})).length, 0, "keys") },
];

export function main(): number {
  console.log(`blacklist         ${JSON.stringify(blacklist(SOURCE))}`);
  console.log(`whitelist         ${JSON.stringify(whitelist(SOURCE))}`);
  console.log("");
  console.log("a field that is not named never leaves");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
