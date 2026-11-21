/**
 * The key pair, through WebCrypto, which is the same API in node and in a page.
 *
 * The public half is exported as raw bytes and travels inside the capability; the private half never
 * leaves the device that minted it. ECDSA P-256 is the curve every browser this book has measured
 * supports, and it is why the gate can sign and verify for real.
 */

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

export type KeyPair = { readonly privateKey: CryptoKey; readonly publicKey: CryptoKey };

export async function generateKeyPair(): Promise<KeyPair> {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"]);
  return pair as KeyPair;
}

/** base64url without a dependency: btoa and atob are in every browser and in node. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

const b64 = (bytes: ArrayBuffer): string => toBase64Url(new Uint8Array(bytes));
const bytes = (text: string): Uint8Array<ArrayBuffer> => fromBase64Url(text);

export async function exportPublic(key: CryptoKey): Promise<string> {
  return b64(await crypto.subtle.exportKey("raw", key));
}

export async function importPublic(text: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes(text), ALGORITHM, true, ["verify"]);
}

export async function sign(privateKey: CryptoKey, payload: string): Promise<string> {
  return b64(await crypto.subtle.sign(SIGN, privateKey, new TextEncoder().encode(payload)));
}

export async function verifyBytes(publicKey: CryptoKey, payload: string, signature: string): Promise<boolean> {
  return crypto.subtle.verify(SIGN, publicKey, bytes(signature), new TextEncoder().encode(payload));
}
