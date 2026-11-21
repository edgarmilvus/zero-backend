/**
 * Exercise 4 - the export that outlived its permission.
 *
 * A reader that checks the signature and not the clock renders a file whose permission expired last
 * year. The signature says who may read; the expiry says until when; a reader needs both.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Sealed = { readonly exp: number; readonly signatureValid: boolean };

/** The bug: the seal is checked and the clock is not. */
export function rendersWithoutClock(sealed: Sealed): boolean {
  return sealed.signatureValid;
}

/** The repair: signature first, then the clock, then the content. */
export function rendersWithClock(sealed: Sealed, now: number): boolean {
  if (!sealed.signatureValid) return false;
  return now < sealed.exp;
}

export type Verdict = { readonly ok: boolean; readonly reason: string };

export function verdictOf(sealed: Sealed, now: number, digestOk: boolean): Verdict {
  if (!sealed.signatureValid) return { ok: false, reason: "the permission in this file does not verify" };
  if (now >= sealed.exp) return { ok: false, reason: "the permission in this file has expired" };
  if (!digestOk) return { ok: false, reason: "the notes were changed after the file was sealed" };
  return { ok: true, reason: "verified" };
}

const NOW = 1_700_000_000_000;
const LIVE: Sealed = { exp: NOW + 60_000, signatureValid: true };
const DEAD: Sealed = { exp: NOW - 60_000, signatureValid: true };

export const checks: readonly Check[] = [
  { name: "the clockless reader renders an expired file", run: () => eq(rendersWithoutClock(DEAD), true, "renders") },
  { name: "the clocked reader does not", run: () => eq(rendersWithClock(DEAD, NOW), false, "renders") },
  { name: "a live file renders in both", run: () => {
    eq(rendersWithoutClock(LIVE), true, "clockless");
    return eq(rendersWithClock(LIVE, NOW), true, "clocked");
  } },
  { name: "the exact expiry instant is expired", run: () => eq(rendersWithClock({ ...LIVE, exp: NOW }, NOW), false, "edge") },
  { name: "a forged signature is refused before the clock", run: () => eq(verdictOf({ ...DEAD, signatureValid: false }, NOW, true).reason.includes("verify"), true, "reason") },
  { name: "an expired live-signature file names the clock", run: () => eq(verdictOf(DEAD, NOW, true).reason.includes("expired"), true, "reason") },
  { name: "a bad digest is refused after the clock", run: () => eq(verdictOf(LIVE, NOW, false).reason.includes("sealed"), true, "reason") },
  { name: "a good file verifies", run: () => eq(verdictOf(LIVE, NOW, true).ok, true, "ok") },
  { name: "a clock before the archive was sealed still renders a live file", run: () => eq(rendersWithClock(LIVE, NOW - 1_000), true, "early") },
];

export function main(): number {
  console.log(`clockless         ${rendersWithoutClock(DEAD)} on an expired file`);
  console.log(`clocked           ${rendersWithClock(DEAD, NOW)} on the same file`);
  console.log("");
  console.log("a signature says who may read; only the clock says until when");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
