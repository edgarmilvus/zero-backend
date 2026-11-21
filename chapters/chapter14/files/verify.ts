/**
 * The check: signature first, then expiry, then scope.
 *
 * The order is the security property. Expiry and scope are fields inside the payload, and a payload is
 * whatever the holder of the link typed; reading them before the signature verifies is trusting an
 * attacker's claim about its own permissions.
 */

import { canonicalValue, decode, type Payload } from "./capability.ts";
import { importPublic, verifyBytes } from "./keys.ts";
import { isSubset, type Scope } from "./scope.ts";

export type Verdict =
  | { readonly ok: true; readonly payload: Payload }
  | { readonly ok: false; readonly reason: string };

export type Check = {
  readonly now?: number;
  readonly required?: Scope;
};

export async function verify(token: string, check: Check = {}): Promise<Verdict> {
  let parsed: { payload: Payload; signature: string };
  try {
    parsed = decode(token);
  } catch (error) {
    return { ok: false, reason: `malformed: ${(error as Error).message}` };
  }

  let key: CryptoKey;
  try {
    key = await importPublic(parsed.payload.iss);
  } catch {
    return { ok: false, reason: "issuer: not a P-256 public key" };
  }

  const signed = await verifyBytes(key, canonicalValue(parsed.payload), parsed.signature);
  if (!signed) return { ok: false, reason: "signature: does not match the payload" };

  const now = check.now ?? Date.now();
  if (now >= parsed.payload.exp) return { ok: false, reason: `expired at ${new Date(parsed.payload.exp).toISOString()}` };

  if (check.required && !isSubset(check.required, parsed.payload.scope)) {
    return { ok: false, reason: `scope: needs ${check.required.join(",")}, has ${parsed.payload.scope.join(",")}` };
  }

  return { ok: true, payload: parsed.payload };
}

/** A capability that is valid now is not valid tomorrow: the caller states the moment it cares about. */
export function isFresh(payload: Payload, now: number, skewMs = 0): boolean {
  return now + skewMs < payload.exp;
}
