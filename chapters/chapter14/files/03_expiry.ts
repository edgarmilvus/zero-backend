/**
 * Example 3 - expiry is a number in the signed text, and it is compared with a moment the caller states.
 *
 *   node chapters/chapter14/files/03_expiry.ts
 *
 * The same capability is valid at one instant and expired at another; the program asks twice with two
 * different `now` values, so the test does not depend on the wall clock of the machine running it.
 */

import { mint } from "./capability.ts";
import { generateKeyPair } from "./keys.ts";
import { assertRefuses, renderVerdict } from "./report.ts";
import { isFresh, verify } from "./verify.ts";

const HOUR = 60 * 60 * 1000;

export async function main(): Promise<number> {
  const keys = await generateKeyPair();
  const minted = await mint(keys, ["read:own"], { ttlMs: HOUR, now: 1_000_000, nonce: "clock" });

  const before = await verify(minted.token, { now: 1_000_000 + 30 * 60_000 });
  console.log(renderVerdict(before));

  const atEdge = await verify(minted.token, { now: minted.payload.exp });
  console.log(renderVerdict(atEdge));
  assertRefuses(atEdge, "expired");

  const after = await verify(minted.token, { now: minted.payload.exp + 1 });
  console.log(renderVerdict(after));
  assertRefuses(after, "expired");

  console.log("");
  console.log(`fresh at t+1h-1:  ${isFresh(minted.payload, minted.payload.exp - 1)}`);
  console.log(`fresh at t+1h:    ${isFresh(minted.payload, minted.payload.exp)}`);

  return before.ok && !isFresh(minted.payload, minted.payload.exp) ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
