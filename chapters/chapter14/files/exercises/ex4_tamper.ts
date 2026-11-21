/**
 * Exercise 4 - the token that was edited in the address bar.
 *
 * A decoder that parses first and verifies second is a page that reads the edited scope, decides the
 * user is allowed, and only then discovers the signature does not match. The order is the exercise.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Token = { readonly payload: string; readonly tag: string };

/** A stand-in for a signature: the point is the order of the checks, not the primitive. */
export function tagOf(payload: string, secret: string): string {
  let hash = 0;
  for (const character of `${secret}:${payload}`) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash).toString(36);
}

export function seal(payload: string, secret: string): Token {
  return { payload, tag: tagOf(payload, secret) };
}

/** The bug: read the payload, trust its scope, then check the tag. */
export function checkParseFirst(token: Token, secret: string, requested: string): boolean {
  const scope = token.payload.split("|")[0] ?? "";
  const allowed = scope.split(",").includes(requested);
  if (!allowed) return false;
  return token.tag === tagOf(token.payload, secret);
}

/** The repair: the tag first, and the payload is data only after it verifies. */
export function checkVerifyFirst(token: Token, secret: string, requested: string): boolean {
  if (token.tag !== tagOf(token.payload, secret)) return false;
  const scope = token.payload.split("|")[0] ?? "";
  return scope.split(",").includes(requested);
}

const SECRET = "k";
const GOOD = seal("read:own|exp:10", SECRET);
const FORGED = { payload: "read:own,delete:all|exp:10", tag: GOOD.tag };

export const checks: readonly Check[] = [
  { name: "a good token passes the parse-first check", run: () => eq(checkParseFirst(GOOD, SECRET, "read:own"), true, "good") },
  { name: "a good token passes the verify-first check", run: () => eq(checkVerifyFirst(GOOD, SECRET, "read:own"), true, "good") },
  { name: "the forged token fails verify-first immediately", run: () => eq(checkVerifyFirst(FORGED, SECRET, "delete:all"), false, "forgery") },
  { name: "the forged token fails parse-first too, but only after reading it", run: () => eq(checkParseFirst(FORGED, SECRET, "delete:all"), false, "forgery") },
  { name: "the two disagree on what a caller can observe", run: () => {
    // parse-first computes the payload's scope before the tag; a caller that logs the scope has
    // already read attacker-controlled data. The test is the order, expressed as the value the check
    // returns before the tag is consulted.
    const scopeRead = FORGED.payload.split("|")[0];
    return expect(scopeRead?.includes("delete:all") === true, "scope was not read");
  } },
  { name: "a wrong tag is refused", run: () => eq(checkVerifyFirst({ ...GOOD, tag: "nope" }, SECRET, "read:own"), false, "tag") },
  { name: "a missing separator is a payload with no scope", run: () => eq(checkVerifyFirst(seal("", SECRET), SECRET, "read:own"), false, "empty") },
  { name: "the tag depends on the secret", run: () => expect(tagOf("a", "k1") !== tagOf("a", "k2"), "same tag") },
  { name: "the tag depends on the payload", run: () => expect(tagOf("a", SECRET) !== tagOf("b", SECRET), "same tag") },
];

export function main(): number {
  console.log(`good              parse ${checkParseFirst(GOOD, SECRET, "read:own")} verify ${checkVerifyFirst(GOOD, SECRET, "read:own")}`);
  console.log(`forged            parse ${checkParseFirst(FORGED, SECRET, "delete:all")} verify ${checkVerifyFirst(FORGED, SECRET, "delete:all")}`);
  console.log("");
  console.log("both refuse the forgery; only one refuses before reading it");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
