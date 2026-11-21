/**
 * Example 4 - three forgeries, three refusals from three different checks.
 *
 *   node chapters/chapter14/files/04_tamper.ts
 *
 * The payload is JSON in a URL, so a holder can edit it. The only thing that makes the edit fail is
 * the signature, and the three edits below are the ones worth trying: a wider scope, another issuer,
 * and a truncated signature.
 */

import { mint } from "./capability.ts";
import { generateKeyPair } from "./keys.ts";
import { assertRefuses, renderVerdict } from "./report.ts";
import { verify } from "./verify.ts";

const b64 = (text: string): string => Buffer.from(text, "utf8").toString("base64url");
const fromb64 = (text: string): string => Buffer.from(text, "base64url").toString("utf8");

export async function main(): Promise<number> {
  const keys = await generateKeyPair();
  const other = await generateKeyPair();
  const minted = await mint(keys, ["read:own"], { ttlMs: 60_000, nonce: "tamper" });
  const [body, signature] = minted.token.split(".");
  const payload = JSON.parse(fromb64(body ?? "")) as Record<string, unknown>;

  const forgedScope = b64(JSON.stringify({ ...payload, scope: ["delete:all"] }));
  const forgedIssuer = b64(
    JSON.stringify({ ...payload, iss: Buffer.from((await crypto.subtle.exportKey("raw", other.publicKey)) as ArrayBuffer).toString("base64url") }),
  );
  const truncated = `${body}.${(signature ?? "").slice(0, 20)}`;

  const cases: readonly [string, string][] = [
    ["wider scope", `${forgedScope}.${signature}`],
    ["another issuer", `${forgedIssuer}.${signature}`],
    ["truncated signature", truncated],
  ];

  let refused = 0;
  for (const [label, token] of cases) {
    const verdict = await verify(token, { now: 0 });
    console.log(`${label.padEnd(20)} ${renderVerdict(verdict)}`);
    if (!verdict.ok) refused += 1;
  }

  assertRefuses(await verify(`${forgedScope}.${signature}`), "signature");
  console.log("");
  console.log(`${refused} forgeries refused, and the original still verifies: ${(await verify(minted.token, { now: 0 })).ok}`);

  return refused === cases.length ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
