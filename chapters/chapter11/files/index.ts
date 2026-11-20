/**
 * The index: a name, a dimension, the vectors, and the rule that makes it trustworthy.
 *
 * The index is not a database. It is an array of Float32Array and a parallel array of ids, and the
 * search is a cosine against every vector. What makes it more than that is the two fields at the top:
 * an index built by a different model is not a worse index, it is a different coordinate system, and
 * a search in the wrong one returns numbers that look like scores.
 */

import { cosine, topK, type Scored } from "./vector.ts";

export type IndexRow = {
  readonly id: string;
  readonly vector: Float32Array;
};

export type VectorIndex = {
  readonly modelId: string;
  readonly dims: number;
  readonly rows: readonly IndexRow[];
  /** What each row's text was, kept for the page; not used by the search. */
  readonly texts: ReadonlyMap<string, string>;
};

export function buildIndex(
  modelId: string,
  dims: number,
  rows: readonly { id: string; vector: Float32Array; text?: string }[],
): VectorIndex {
  if (modelId.trim() === "") throw new Error("index: a model id is required, or the vectors mean nothing");
  if (!Number.isInteger(dims) || dims <= 0) throw new Error(`index: dims must be a positive integer, got ${dims}`);

  const seen = new Set<string>();
  const texts = new Map<string, string>();
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error(`index: duplicate id ${row.id}`);
    if (row.vector.length !== dims) {
      throw new Error(`index: ${row.id} has ${row.vector.length} dimensions, the index has ${dims}`);
    }
    seen.add(row.id);
    if (row.text !== undefined) texts.set(row.id, row.text);
  }

  return { modelId, dims, rows: rows.map(({ id, vector }) => ({ id, vector })), texts };
}

/** Refuses a query embedded by another model, with both names in the message. */
export function assertCompatible(index: VectorIndex, modelId: string, dims: number): void {
  if (index.modelId !== modelId) {
    throw new Error(
      `index: built by ${index.modelId}, queried by ${modelId}; rebuild it, the vectors are in different spaces`,
    );
  }
  if (index.dims !== dims) {
    throw new Error(`index: ${index.dims} dimensions, the query has ${dims}`);
  }
}

/**
 * The k nearest rows.
 *
 * Brute force over every vector, which at forty notes is a microsecond and at a hundred thousand is
 * the number the chapter stops at: the sort is the cost, and a graph index is the answer when the
 * sort stops fitting in a frame.
 */
export function searchIndex(
  index: VectorIndex,
  query: Float32Array,
  k: number,
  options: { readonly modelId?: string } = {},
): Scored[] {
  if (options.modelId !== undefined) assertCompatible(index, options.modelId, query.length);
  if (query.length !== index.dims) {
    throw new Error(`search: query has ${query.length} dimensions, the index has ${index.dims}`);
  }
  const scored: Scored[] = index.rows.map((row) => ({ id: row.id, score: cosine(query, row.vector) }));
  return topK(scored, k);
}
