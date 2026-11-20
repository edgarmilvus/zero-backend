/**
 * Exercise 4 - the state that decoded into nonsense.
 *
 * A sync payload is a file format with no schema on the wire. The decoder is the schema, and a decoder
 * that trusts its input is a replica with a counter of zero and a note with no title.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Replica = { readonly name: string; readonly entries: Record<string, { clock: number; body: string | null }> };

export function decode(raw: unknown): Replica {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("sync: expected an object");
  const root = raw as { name?: unknown; entries?: unknown };
  if (typeof root.name !== "string" || root.name.trim() === "") throw new Error("sync.name: missing");
  if (typeof root.entries !== "object" || root.entries === null || Array.isArray(root.entries)) {
    throw new Error("sync.entries: expected an object");
  }

  const entries: Replica["entries"] = {};
  for (const [id, value] of Object.entries(root.entries as Record<string, unknown>)) {
    if (id.trim() === "") throw new Error("sync.entries: an empty id");
    const entry = value as { clock?: unknown; body?: unknown };
    if (typeof entry.clock !== "number" || !Number.isInteger(entry.clock) || entry.clock < 1) {
      throw new Error(`sync.entries[${id}].clock: expected a positive integer`);
    }
    if (entry.body !== null && typeof entry.body !== "string") {
      throw new Error(`sync.entries[${id}].body: expected a string or null`);
    }
    entries[id] = { clock: entry.clock, body: entry.body };
  }
  return { name: root.name, entries };
}

const GOOD = { name: "laptop", entries: { n1: { clock: 1, body: "milk" } } };

export const checks: readonly Check[] = [
  { name: "a good state decodes", run: () => eq(decode(GOOD).name, "laptop", "name") },
  { name: "a missing name is refused", run: () => {
    const error = throws(() => decode({ entries: {} }), "name");
    return expect(error.message.includes("name"), error.message);
  } },
  { name: "an array is not a state", run: () => {
    const error = throws(() => decode([]), "array");
    return expect(error.message.includes("object"), error.message);
  } },
  { name: "an array of entries is refused", run: () => {
    const error = throws(() => decode({ name: "a", entries: [] }), "entries");
    return expect(error.message.includes("object"), error.message);
  } },
  { name: "a zero clock is refused", run: () => {
    const error = throws(() => decode({ name: "a", entries: { n1: { clock: 0, body: "x" } } }), "clock");
    return expect(error.message.includes("positive"), error.message);
  } },
  { name: "a string clock is refused", run: () => {
    const error = throws(() => decode({ name: "a", entries: { n1: { clock: "1", body: "x" } } }), "clock");
    return expect(error.message.includes("positive"), error.message);
  } },
  { name: "a numeric body is refused", run: () => {
    const error = throws(() => decode({ name: "a", entries: { n1: { clock: 1, body: 4 } } }), "body");
    return expect(error.message.includes("string or null"), error.message);
  } },
  { name: "a null body is a tombstone and is accepted", run: () => eq(decode({ name: "a", entries: { n1: { clock: 1, body: null } } }).entries.n1?.body, null, "body") },
  { name: "the empty state is valid", run: () => eq(Object.keys(decode({ name: "a", entries: {} }).entries).length, 0, "entries") },
];

export function main(): number {
  console.log(`decoded           ${JSON.stringify(decode(GOOD))}`);
  try {
    decode({ name: "a", entries: { n1: { clock: 0, body: "x" } } });
  } catch (error) {
    console.log(`refused           ${(error as Error).message}`);
  }
  console.log("");
  console.log("the wire has no types; the decoder is where they are");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
