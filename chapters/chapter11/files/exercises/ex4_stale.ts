/**
 * Exercise 4 - the index from the last model.
 *
 * An index is a set of vectors and a claim about what produced them. Drop the claim and a model
 * upgrade becomes a silent change of coordinate system: every query still returns five rows, and
 * every row is in the wrong place.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Index = {
  readonly model: string;
  readonly dims: number;
  readonly ids: readonly string[];
  readonly vectors: readonly (readonly number[])[];
};

export type Hit = { readonly id: string; readonly score: number };

export function buildIndex(model: string, dims: number, rows: readonly { id: string; vector: readonly number[] }[]): Index {
  if (model.trim() === "") throw new Error("index: a model id is required");
  if (!Number.isInteger(dims) || dims <= 0) throw new Error(`index: dims ${dims} is not a dimension count`);

  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error(`index: duplicate id ${row.id}`);
    if (row.vector.length !== dims) {
      throw new Error(`index: ${row.id} has ${row.vector.length} dimensions, the index has ${dims}`);
    }
    ids.add(row.id);
  }
  return { model, dims, ids: [...ids], vectors: rows.map((row) => row.vector) };
}

/** The refusal: both names in the message, because the reader has to know which one to rebuild. */
export function assertSameModel(index: Index, model: string, dims: number): void {
  if (index.model !== model) {
    throw new Error(`index: built by ${index.model}, queried by ${model}; rebuild it, the spaces differ`);
  }
  if (index.dims !== dims) throw new Error(`index: ${index.dims} dimensions, the query has ${dims}`);
}

export function query(index: Index, model: string, vector: readonly number[]): Hit[] {
  assertSameModel(index, model, vector.length);
  return index.ids
    .map((id, at) => {
      const row = index.vectors[at] ?? [];
      let dot = 0;
      let left = 0;
      let right = 0;
      for (let position = 0; position < vector.length; position += 1) {
        const x = vector[position] as number;
        const y = row[position] as number;
        dot += x * y;
        left += x * x;
        right += y * y;
      }
      return { id, score: left === 0 || right === 0 ? 0 : dot / Math.sqrt(left * right) };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Merging two indexes is only meaningful when they were built in the same space. */
export function merge(left: Index, right: Index): Index {
  assertSameModel(left, right.model, right.dims);
  return {
    model: left.model,
    dims: left.dims,
    ids: [...left.ids, ...right.ids],
    vectors: [...left.vectors, ...right.vectors],
  };
}

const ROWS = [
  { id: "a", vector: [1, 0, 0] },
  { id: "b", vector: [0.8, 0.6, 0] },
  { id: "c", vector: [0, 1, 0] },
];

export const checks: readonly Check[] = [
  {
    name: "a query in the index's own model returns scores",
    run: () => eq(query(buildIndex("m1", 3, ROWS), "m1", [1, 0, 0]).length, 3, "hits"),
  },
  {
    name: "a query from another model is refused with both names",
    run: () => {
      const error = throws(() => query(buildIndex("m1", 3, ROWS), "m2", [1, 0, 0]), "model");
      expect(error.message.includes("m1"), error.message);
      return expect(error.message.includes("m2"), error.message);
    },
  },
  {
    name: "a query with the wrong number of dimensions is refused",
    run: () => {
      const error = throws(() => query(buildIndex("m1", 3, ROWS), "m1", [1, 0]), "dims");
      return expect(error.message.includes("dimensions"), error.message);
    },
  },
  {
    name: "an index with no model id cannot be built",
    run: () => {
      const error = throws(() => buildIndex("  ", 3, ROWS), "no model");
      return expect(error.message.includes("model id"), error.message);
    },
  },
  {
    name: "a duplicate id is refused",
    run: () => {
      const error = throws(() => buildIndex("m1", 3, [...ROWS, { id: "a", vector: [0, 0, 1] }]), "duplicate");
      return expect(error.message.includes("duplicate"), error.message);
    },
  },
  {
    name: "a vector of the wrong length is refused",
    run: () => {
      const error = throws(() => buildIndex("m1", 3, [{ id: "x", vector: [1, 2] }]), "length");
      return expect(error.message.includes("dimensions"), error.message);
    },
  },
  {
    name: "two indexes from the same model merge",
    run: () => {
      const merged = merge(buildIndex("m1", 3, ROWS), buildIndex("m1", 3, [{ id: "d", vector: [0, 0, 1] }]));
      return eq(merged.ids.length, 4, "merged");
    },
  },
  {
    name: "two indexes from different models do not merge",
    run: () => {
      const error = throws(
        () => merge(buildIndex("m1", 3, ROWS), buildIndex("m2", 3, [{ id: "d", vector: [0, 0, 1] }])),
        "merge",
      );
      return expect(error.message.includes("spaces differ"), error.message);
    },
  },
  {
    name: "the scores are ordered and the best match is first",
    run: () => eq(query(buildIndex("m1", 3, ROWS), "m1", [1, 0, 0])[0]?.id, "a", "best"),
  },
];

export function main(): number {
  const index = buildIndex("all-MiniLM-L6-v2", 3, ROWS);
  console.log(`best match        ${query(index, "all-MiniLM-L6-v2", [1, 0, 0])[0]?.id}`);
  try {
    query(index, "bge-small", [1, 0, 0]);
  } catch (error) {
    console.log(`refused           ${(error as Error).message}`);
  }
  console.log("");
  console.log("the model id is not metadata: it is the coordinate system");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
