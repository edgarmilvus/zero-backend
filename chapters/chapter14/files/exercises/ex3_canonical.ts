/**
 * Exercise 3 - the signature over a different byte string.
 *
 * Two devices that serialise the same capability with a different key order produce different bytes.
 * A signature over one does not verify the other, and the bug only appears between two implementations.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

/** The bug: JSON as the engine happens to order the keys. */
export function byInsertionOrder(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

/** The repair: keys sorted at every level, arrays kept in order, undefined dropped. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const LEFT = { iss: "key", exp: 10, scope: ["read:own"] };
const RIGHT = { scope: ["read:own"], exp: 10, iss: "key" };

export const checks: readonly Check[] = [
  { name: "insertion order differs between two objects", run: () => expect(byInsertionOrder(LEFT) !== byInsertionOrder(RIGHT), "same bytes") },
  { name: "canonical order does not", run: () => eq(canonical(LEFT), canonical(RIGHT), "bytes") },
  { name: "the canonical text is sorted", run: () => eq(canonical(LEFT), '{"exp":10,"iss":"key","scope":["read:own"]}', "text") },
  { name: "arrays keep their order", run: () => eq(canonical([2, 1]), "[2,1]", "arrays") },
  { name: "nested objects are sorted too", run: () => eq(canonical({ a: { z: 1, y: 2 } }), '{"a":{"y":2,"z":1}}', "nested") },
  { name: "undefined fields are dropped", run: () => eq(canonical({ a: 1, b: undefined }), '{"a":1}', "undefined") },
  { name: "null is a value and survives", run: () => eq(canonical({ a: null }), '{"a":null}', "null") },
  { name: "numbers keep their value", run: () => eq(canonical({ a: 1.5 }), '{"a":1.5}', "number") },
  { name: "the same object repeated gives the same bytes", run: () => {
    const first = canonical(LEFT);
    return eq(Array.from({ length: 50 }, () => canonical(LEFT)).every((text) => text === first), true, "unstable");
  } },
  { name: "a key with a quote is escaped, not sorted into danger", run: () => eq(canonical({ 'a"b': 1 }), '{"a\\"b":1}', "escape") },
];

export function main(): number {
  console.log(`insertion         ${byInsertionOrder(LEFT)}`);
  console.log(`insertion, other  ${byInsertionOrder(RIGHT)}`);
  console.log(`canonical         ${canonical(LEFT)}`);
  console.log("");
  console.log("a signature is over bytes; the bytes have to be a function of the value, not of the code that wrote it");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
