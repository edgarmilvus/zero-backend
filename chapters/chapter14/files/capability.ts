/**
 * The capability: a payload, a signature, and a token that fits in a fragment.
 *
 * `canonical` sorts keys, because two devices that serialise the same object with a different key
 * order produce different bytes and a signature over one does not verify the other. That is exercise 3,
 * and it is the kind of bug that only appears between two implementations.
 */

import { exportPublic, fromBase64Url, sign, toBase64Url, type KeyPair } from "./keys.ts";
import { parseScope, type Scope } from "./scope.ts";

export type Payload = {
  readonly v: 1;
  /** The issuer's public key, base64url. */
  readonly iss: string;
  readonly scope: Scope;
  /** Epoch milliseconds. A number, so two devices compare the same thing. */
  readonly exp: number;
  readonly nonce: string;
};

export type Minted = {
  readonly payload: Payload;
  readonly canonical: string;
  readonly signature: string;
  readonly token: string;
};

/** Deterministic JSON: keys sorted, no whitespace. The bytes the signature is over. */
export function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function mint(
  keys: KeyPair,
  scope: readonly string[],
  options: { readonly ttlMs: number; readonly now?: number; readonly nonce?: string },
): Promise<Minted> {
  if (!(options.ttlMs > 0)) throw new Error(`mint: ttl ${options.ttlMs} is not a duration`);
  const payload: Payload = {
    v: 1,
    iss: await exportPublic(keys.publicKey),
    scope: parseScope(scope),
    exp: (options.now ?? Date.now()) + options.ttlMs,
    nonce: options.nonce ?? crypto.randomUUID(),
  };
  const text = canonicalValue(payload);
  const signature = await sign(keys.privateKey, text);
  return { payload, canonical: text, signature, token: `${encodeText(text)}.${signature}` };
}

export function encodeText(text: string): string {
  return toBase64Url(new TextEncoder().encode(text));
}

export function decodeText(body: string): string {
  return new TextDecoder().decode(fromBase64Url(body));
}

/**
 * Parses without verifying. A decoder that verifies is a decoder that cannot report *what* was
 * tampered with, so the two steps are separate and the caller has to ask for both.
 */
export function decode(token: string): { payload: Payload; signature: string } {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("token: expected payload.signature");
  const payload = JSON.parse(decodeText(body)) as Payload;
  if (payload.v !== 1) throw new Error(`token: version ${String(payload.v)} is not supported`);
  if (typeof payload.iss !== "string" || payload.iss.length < 40) throw new Error("token.iss: expected a public key");
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) throw new Error("token.exp: expected epoch ms");
  parseScope(payload.scope);
  return { payload, signature };
}

export { canonicalValue as canonical };
