/**
 * What the chapter prints, and the two assertions a capability test needs.
 */

import type { Payload } from "./capability.ts";
import type { Verdict } from "./verify.ts";
import { describe } from "./scope.ts";

export function renderCapability(payload: Payload, now: number): string {
  const minutes = Math.max(0, Math.round((payload.exp - now) / 60_000));
  return [
    `issuer            ${payload.iss.slice(0, 16)}...`,
    `scope             ${describe(payload.scope)}`,
    `expires           in ${minutes} minute(s)`,
    `nonce             ${payload.nonce.slice(0, 8)}...`,
  ].join("\n");
}

export function renderVerdict(verdict: Verdict): string {
  return verdict.ok ? `allowed           ${describe(verdict.payload.scope)}` : `refused           ${verdict.reason}`;
}

export function assertAllows(verdict: Verdict): Payload {
  if (!verdict.ok) throw new Error(`expected the capability to be allowed: ${verdict.reason}`);
  return verdict.payload;
}

export function assertRefuses(verdict: Verdict, fragment: string): void {
  if (verdict.ok) throw new Error(`expected a refusal containing "${fragment}", and it was allowed`);
  if (!verdict.reason.includes(fragment)) {
    throw new Error(`expected a refusal containing "${fragment}", got "${verdict.reason}"`);
  }
}
