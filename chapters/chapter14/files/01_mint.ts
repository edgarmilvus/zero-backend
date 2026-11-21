/**
 * Example 1 - mint, verify, tamper.
 *
 *   node chapters/chapter14/files/01_mint.ts
 *
 * A capability for reading one's own notes, valid for an hour, minted in this process. The program
 * verifies it, edits one character of the payload, and watches the signature refuse the edit.
 */

import { mint } from "./capability.ts";
import { generateKeyPair } from "./keys.ts";
import { assertAllows, assertRefuses, renderCapability, renderVerdict } from "./report.ts";
import { verify } from "./verify.ts";

export async function main(): Promise<number> {
  const keys = await generateKeyPair();
  const minted = await mint(keys, ["read:own", "write:own"], { ttlMs: 60 * 60 * 1000, nonce: "demo" });

  console.log(renderCapability(minted.payload, Date.now()));
  console.log(`token             ${minted.token.length} characters`);
  console.log("");

  const allowed = await verify(minted.token, { required: ["read:own"] });
  console.log(renderVerdict(allowed));
  assertAllows(allowed);

  // A forgery that is still valid JSON: the scope widened, the signature from the original.
  const [body, signature] = minted.token.split(".");
  const raw = JSON.parse(Buffer.from(body ?? "", "base64url").toString("utf8")) as { scope: string[] };
  raw.scope = ["delete:all"];
  const forged = `${Buffer.from(JSON.stringify(raw), "utf8").toString("base64url")}.${signature}`;
  const tampered = await verify(forged);
  console.log(renderVerdict(tampered));
  assertRefuses(tampered, "signature");

  const tooMuch = await verify(minted.token, { required: ["delete:all"] });
  console.log(renderVerdict(tooMuch));
  assertRefuses(tooMuch, "scope");

  console.log("");
  console.log("the token is the permission, and the signature is what makes it one");
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
