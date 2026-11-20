/**
 * The fixture: the model's vectors as a file, and the two evaluations that make the chapter's claim
 * measurable.
 *
 * `loadFixture` touches the disk; everything else is pure, so the page can import this file and never
 * call the one function that needs node.
 */

import { keywordScore, type Topic } from "./corpus.ts";
import { buildIndex, searchIndex } from "./index.ts";

export type FixtureNote = {
  readonly id: string;
  readonly topic: Topic;
  readonly text: string;
  readonly vector: Float32Array;
};

export type FixtureQuery = FixtureNote;

export type Fixture = {
  readonly model: string;
  readonly dtype: string;
  readonly dims: number;
  readonly notes: readonly FixtureNote[];
  readonly queries: readonly FixtureQuery[];
};

type Raw = {
  model?: unknown;
  dtype?: unknown;
  dims?: unknown;
  notes?: unknown;
  queries?: unknown;
};

function vector(value: unknown, dims: number, where: string): Float32Array {
  if (!Array.isArray(value)) throw new Error(`${where}: expected an array of numbers`);
  if (value.length !== dims) throw new Error(`${where}: ${value.length} dimensions, the file says ${dims}`);
  for (const component of value) {
    if (typeof component !== "number" || !Number.isFinite(component)) {
      throw new Error(`${where}: a component is not a finite number`);
    }
  }
  return Float32Array.from(value as number[]);
}

function rows(value: unknown, dims: number, where: string): FixtureNote[] {
  if (!Array.isArray(value)) throw new Error(`${where}: expected an array`);
  return value.map((entry, index) => {
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string") throw new Error(`${where}[${index}]: missing id`);
    if (typeof row.text !== "string") throw new Error(`${where}[${index}]: missing text`);
    if (typeof row.topic !== "string") throw new Error(`${where}[${index}]: missing topic`);
    return {
      id: row.id,
      topic: row.topic as Topic,
      text: row.text,
      vector: vector(row.vector, dims, `${where}[${index}]`),
    };
  });
}

/** Validates the file before anything is built on it, including the model's own identity. */
export function fromJson(raw: unknown): Fixture {
  if (typeof raw !== "object" || raw === null) throw new Error("fixture: expected an object");
  const root = raw as Raw;

  if (typeof root.model !== "string" || root.model.trim() === "") {
    throw new Error("fixture.model: expected the model that produced these vectors");
  }
  if (typeof root.dtype !== "string") throw new Error("fixture.dtype: expected the quantization of the model");
  if (typeof root.dims !== "number" || !Number.isInteger(root.dims) || root.dims <= 0) {
    throw new Error("fixture.dims: expected a positive integer");
  }
  if (root.notes === undefined || root.queries === undefined) {
    throw new Error("fixture: expected notes and queries");
  }

  const notes = rows(root.notes, root.dims, "fixture.notes");
  const queries = rows(root.queries, root.dims, "fixture.queries");
  if (notes.length === 0) throw new Error("fixture.notes: the corpus is empty");
  if (queries.length === 0) throw new Error("fixture.queries: there is nothing to ask");

  return { model: root.model, dtype: root.dtype, dims: root.dims, notes, queries };
}

export async function loadFixture(path: string): Promise<Fixture> {
  const { readFileSync } = await import("node:fs");
  return fromJson(JSON.parse(readFileSync(path, "utf8")));
}

export type Evaluation = {
  readonly semantic: number;
  readonly keyword: number;
  readonly perQuery: readonly { id: string; semantic: number; keyword: number }[];
};

/**
 * Precision@k for both searches, against the topic label.
 *
 * A hit is a note from the query's subject, which is the only ground truth this corpus has and the
 * only one a reader can check without reading forty paragraphs. It is stricter than "looks relevant"
 * and kinder than an exact id list.
 */
export function evaluate(fixture: Fixture, k = 5): Evaluation {
  const index = buildIndex(fixture.model, fixture.dims, fixture.notes.map((note) => ({
    id: note.id,
    vector: note.vector,
  })));

  const topicOf = new Map(fixture.notes.map((note) => [note.id, note.topic]));
  const perQuery: { id: string; semantic: number; keyword: number }[] = [];

  for (const query of fixture.queries) {
    const semantic = searchIndex(index, query.vector, k);
    const keyword = fixture.notes
      .map((note) => ({ id: note.id, score: keywordScore(note.text, query.text) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, k);

    perQuery.push({
      id: query.id,
      semantic: semantic.filter((row) => topicOf.get(row.id) === query.topic).length / k,
      keyword: keyword.filter((row) => topicOf.get(row.id) === query.topic).length / k,
    });
  }

  const mean = (key: "semantic" | "keyword"): number =>
    perQuery.reduce((sum, row) => sum + row[key], 0) / perQuery.length;

  return { semantic: mean("semantic"), keyword: mean("keyword"), perQuery };
}
