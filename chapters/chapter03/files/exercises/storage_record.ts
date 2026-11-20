/**
 * Exercise 5, file 2 of 3 - the effect and the schema.
 *
 * The capstone writes an inventory of what it stored: the store's name, the budget it was given
 * and one row per file. Reading it back is easy; refusing a file that does not add up is the
 * work, and the refusal has to name the row as well as the field.
 */

import { readFileSync } from "node:fs";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Inventory = {
  readonly store: string;
  readonly budgetBytes: number;
  readonly files: readonly { readonly name: string; readonly bytes: number }[];
};

type Bag = Record<string, unknown>;

function bag(value: unknown, path: string): Bag {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Bag;
}

export function validateInventory(raw: unknown): Inventory {
  const root = bag(raw, "inventory");

  if (typeof root.store !== "string" || root.store.trim() === "") {
    throw new Error("inventory.store: expected a non-empty string");
  }
  if (typeof root.budgetBytes !== "number" || !Number.isFinite(root.budgetBytes) || root.budgetBytes < 0) {
    throw new Error("inventory.budgetBytes: expected a non-negative number");
  }
  if (!Array.isArray(root.files)) {
    throw new Error("inventory.files: expected an array");
  }

  const files = root.files.map((entry, index) => {
    const row = bag(entry, `inventory.files[${index}]`);
    if (typeof row.name !== "string" || row.name === "") {
      throw new Error(`inventory.files[${index}].name: expected a non-empty string`);
    }
    if (row.name.includes("/")) {
      throw new Error(`inventory.files[${index}].name: "${row.name}" contains a slash`);
    }
    if (typeof row.bytes !== "number" || !Number.isFinite(row.bytes) || row.bytes < 0) {
      throw new Error(`inventory.files[${index}].bytes: expected a non-negative number`);
    }
    return { name: row.name, bytes: row.bytes };
  });

  return { store: root.store, budgetBytes: root.budgetBytes, files };
}

/** The only function here that touches the disk. */
export function readInventory(path: string): Inventory {
  return validateInventory(JSON.parse(readFileSync(path, "utf8")));
}

export function normalize(inventory: Inventory): {
  store: string;
  budgetBytes: number;
  fileCount: number;
  totalBytes: number;
} {
  return {
    store: inventory.store,
    budgetBytes: inventory.budgetBytes,
    fileCount: inventory.files.length,
    totalBytes: inventory.files.reduce((sum, file) => sum + file.bytes, 0),
  };
}

// --- the tests this file owns -------------------------------------------------

export const GOOD = {
  store: "opfs:zero-backend",
  budgetBytes: 1_000_000,
  files: [
    { name: "a.bin", bytes: 400_000 },
    { name: "b.bin", bytes: 300_000 },
  ],
};

function mutate(change: (copy: Bag) => void): unknown {
  const copy = structuredClone(GOOD) as unknown as Bag;
  change(copy);
  return copy;
}

export const checks: readonly Check[] = [
  {
    name: "a complete inventory is accepted",
    run: () => eq(validateInventory(GOOD).files.length, 2, "files"),
  },
  {
    name: "a missing store is refused by name",
    run: () => {
      const error = throws(() => validateInventory(mutate((c) => delete c.store)), "no store");
      return expect(error.message.includes("inventory.store"), error.message);
    },
  },
  {
    name: "a files field that is not an array is refused",
    run: () => {
      const error = throws(() => validateInventory(mutate((c) => (c.files = {}))), "object");
      return expect(error.message.includes("expected an array"), error.message);
    },
  },
  {
    name: "a file without bytes is refused with its index",
    run: () => {
      const error = throws(
        () =>
          validateInventory(
            mutate((c) => {
              (c.files as Bag[])[1] = { name: "b.bin" };
            }),
          ),
        "no bytes",
      );
      return expect(error.message.includes("files[1].bytes"), error.message);
    },
  },
  {
    name: "a file name with a slash is refused",
    run: () => {
      const error = throws(
        () =>
          validateInventory(
            mutate((c) => {
              (c.files as Bag[])[0] = { name: "dir/a.bin", bytes: 1 };
            }),
          ),
        "slash",
      );
      return expect(error.message.includes("slash"), error.message);
    },
  },
  {
    name: "normalize adds the rows up",
    run: () => eq(normalize(validateInventory(GOOD)).totalBytes, 700_000, "total"),
  },
];
