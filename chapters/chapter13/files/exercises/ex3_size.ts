/**
 * Exercise 3 - the bytes a history costs.
 *
 * A state-based sync sends the document, tombstones and all. The exercise is the arithmetic that
 * decides whether that is affordable, and the ratio between a state and a delta.
 */

import { eq, expect, near, throws, type Check } from "./selfcheck.ts";

export type Entry = { readonly payload: number };

/** A rough wire size: a key, a payload of `body` bytes, and the JSON punctuation around them. */
export function stateBytes(count: number, body: number): number {
  if (!Number.isInteger(count) || count < 0) throw new Error(`count: ${count} is not a note count`);
  if (!Number.isInteger(body) || body < 0) throw new Error(`body: ${body} is not a size`);
  return count * (body + 40);
}

/** A delta is the entries a sync actually changed, which is the number that makes a protocol worth it. */
export function deltaBytes(changed: number, body: number): number {
  return stateBytes(changed, body);
}

export function exchangeBytes(devices: number, bytes: number): number {
  if (!Number.isInteger(devices) || devices < 2) throw new Error(`devices: ${devices} is not a pair`);
  return devices * (devices - 1) * bytes;
}

export const checks: readonly Check[] = [
  { name: "a thousand notes of 120 bytes are 160 kB", run: () => eq(stateBytes(1_000, 120), 160_000, "bytes") },
  { name: "ten changed notes are 1.6 kB", run: () => eq(deltaBytes(10, 120), 1_600, "bytes") },
  { name: "a state is a hundred times a small delta", run: () => eq(stateBytes(1_000, 120) / deltaBytes(10, 120), 100, "ratio") },
  { name: "two devices exchange two copies", run: () => eq(exchangeBytes(2, 1_000), 2_000, "bytes") },
  { name: "three devices exchange six", run: () => eq(exchangeBytes(3, 1_000), 6_000, "bytes") },
  { name: "a negative count is refused", run: () => {
    const error = throws(() => stateBytes(-1, 10), "negative");
    return expect(error.message.includes("note count"), error.message);
  } },
  { name: "a negative body is refused", run: () => {
    const error = throws(() => stateBytes(1, -1), "negative");
    return expect(error.message.includes("size"), error.message);
  } },
  { name: "one device is not an exchange", run: () => {
    const error = throws(() => exchangeBytes(1, 10), "one");
    return expect(error.message.includes("pair"), error.message);
  } },
  { name: "an empty document is free", run: () => eq(stateBytes(0, 120), 0, "bytes") },
  { name: "the delta is linear in the changes", run: () => near(deltaBytes(20, 120) - deltaBytes(10, 120), 1_600, 1e-9, "delta") },
];

export function main(): number {
  console.log(`1000 notes        ${(stateBytes(1_000, 120) / 1024).toFixed(0)} kB`);
  console.log(`10 changed        ${(deltaBytes(10, 120) / 1024).toFixed(1)} kB`);
  console.log(`three devices     ${(exchangeBytes(3, stateBytes(1_000, 120)) / 1024).toFixed(0)} kB per round`);
  console.log("");
  console.log("a state-based protocol trades bytes for a merge with no history");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
