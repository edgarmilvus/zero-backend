/**
 * Example 5 - delegation as attenuation.
 *
 *   node chapters/chapter14/files/05_delegate.ts
 *
 * A holder mints a capability for someone else with a subset of its own scope and an earlier expiry.
 * The child is signed by the same issuer, so it verifies on its own; the widening attempt is refused
 * by the policy check, not by the signature.
 */

import { mint } from "./capability.ts";
import { generateKeyPair } from "./keys.ts";
import { isSubset, parseText } from "./scope.ts";
import { assertAllows, assertRefuses, renderCapability, renderVerdict } from "./report.ts";
import { verify } from "./verify.ts";

const HOUR = 60 * 60 * 1000;

export async function main(): Promise<number> {
  const owner = await generateKeyPair();
  const parent = await mint(owner, ["read:own", "write:own"], { ttlMs: HOUR, nonce: "parent" });

  const requested = parseText("read:own");
  if (!isSubset(requested, parent.payload.scope)) {
    console.error("the delegate asked for more than the parent has");
    return 1;
  }
  const child = await mint(owner, requested, { ttlMs: HOUR / 2, nonce: "child" });

  console.log(renderCapability(parent.payload, Date.now()));
  console.log("");
  console.log(renderCapability(child.payload, Date.now()));
  console.log("");
  assertAllows(await verify(child.token, { required: ["read:own"] }));
  console.log("the child verifies on its own, with a narrower scope and a shorter life");

  // The widening attempt: the policy refuses before a token exists, which is the point of attenuation.
  const widened = parseText("delete:all");
  if (isSubset(widened, parent.payload.scope)) {
    console.error("a scope the parent never had was accepted for delegation");
    return 1;
  }
  console.log(`refused           ${widened.join(",")} is not inside the parent's ${parent.payload.scope.join(",")}`);

  const stale = await verify(child.token, { now: child.payload.exp });
  assertRefuses(stale, "expired");
  console.log(renderVerdict(stale));

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
