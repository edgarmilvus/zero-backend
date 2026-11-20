/**
 * Exercise 2 - the delete that came back.
 *
 * Removing a key from the map is not a delete, it is forgetting. The next merge from a device that
 * still has the note treats the key as missing and reinserts it, and the user watches a note return.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Entry = { readonly value: string; readonly deleted: boolean };
export type Doc = Readonly<Record<string, Entry>>;

/** The bug: delete removes the key. */
export function deleteByRemoval(doc: Doc, key: string): Doc {
  const out = { ...doc };
  delete out[key];
  return out;
}

/** The repair: delete writes a tombstone, which merges like any other value. */
export function deleteByTombstone(doc: Doc, key: string): Doc {
  if (!(key in doc)) throw new Error(`delete: ${key} is not in the document`);
  return { ...doc, [key]: { value: "", deleted: true } };
}

export function merge(local: Doc, incoming: Doc): Doc {
  return { ...local, ...incoming };
}

const DOC: Doc = { n1: { value: "milk", deleted: false }, n2: { value: "eggs", deleted: false } };

export const checks: readonly Check[] = [
  {
    name: "a removal loses the key",
    run: () => eq(Object.keys(deleteByRemoval(DOC, "n1")).length, 1, "keys"),
  },
  {
    name: "and the next merge brings the note back",
    run: () => {
      const other: Doc = { n1: { value: "milk", deleted: false } };
      return eq(merge(deleteByRemoval(DOC, "n1"), other).n1 !== undefined, true, "came back");
    },
  },
  {
    name: "a tombstone keeps the key",
    run: () => eq(Object.keys(deleteByTombstone(DOC, "n1")).length, 2, "keys"),
  },
  {
    name: "and the merge keeps it deleted",
    run: () => {
      const other: Doc = { n1: { value: "milk", deleted: false } };
      return eq(merge(deleteByTombstone(DOC, "n1"), other).n1?.deleted, false, "resurrected");
    },
  },
  {
    name: "the tombstone is still a value the merge has to choose",
    run: () => {
      const merged = merge({ n1: { value: "", deleted: true } }, { n1: { value: "milk", deleted: false } });
      return expect(merged.n1 !== undefined, "the entry vanished");
    },
  },
  {
    name: "deleting a key twice is idempotent",
    run: () => eq(JSON.stringify(deleteByTombstone(deleteByTombstone(DOC, "n1"), "n1")), JSON.stringify(deleteByTombstone(DOC, "n1")), "document"),
  },
  {
    name: "deleting something that is not there is refused",
    run: () => {
      const error = throws(() => deleteByTombstone(DOC, "nope"), "missing");
      return expect(error.message.includes("not in the document"), error.message);
    },
  },
  {
    name: "a tombstone is not a note a reader sees",
    run: () => eq(Object.values(deleteByTombstone(DOC, "n1")).filter((entry) => !entry.deleted).length, 1, "visible"),
  },
  {
    name: "the byte cost of the tombstone is the point",
    run: () => expect(JSON.stringify(deleteByTombstone(DOC, "n1")).length > JSON.stringify(deleteByRemoval(DOC, "n1")).length, "free"),
  },
];

export function main(): number {
  console.log(`removed           ${JSON.stringify(deleteByRemoval(DOC, "n1"))}`);
  console.log(`tombstoned        ${JSON.stringify(deleteByTombstone(DOC, "n1"))}`);
  console.log("");
  console.log("the delete that costs nothing is the delete that comes back");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
