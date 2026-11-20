/**
 * The page: forty notes, two searches, and the number of right answers each one finds.
 *
 * The vectors come from `embeddings.json`, which the model produced; the page does not run the model.
 * That is the chapter's split, and it is what makes this page runnable offline: the model's numbers
 * are in the record, and the search it enables is here.
 */

import { keywordScore } from "../corpus.ts";
import { fromJson, type Fixture } from "../fixture.ts";
import { buildIndex, searchIndex, type VectorIndex } from "../index.ts";
import { int8Cosine, toInt8 } from "../quantize.ts";
import { topK } from "../vector.ts";

type Row = { id: string; topic: string; text: string; score: number };

export type PageResult = {
  readonly query: string;
  readonly semantic: readonly Row[];
  readonly keyword: readonly Row[];
  readonly semanticHits: number;
  readonly keywordHits: number;
  readonly int8Keeps: number;
  readonly searchMs: number;
  readonly floatBytes: number;
  readonly int8Bytes: number;
};

let fixture: Fixture | null = null;
let index: VectorIndex | null = null;

async function ready(): Promise<{ fixture: Fixture; index: VectorIndex }> {
  if (fixture && index) return { fixture, index };
  const response = await fetch("../embeddings.json");
  if (!response.ok) throw new Error(`embeddings.json: HTTP ${response.status}`);
  fixture = fromJson(await response.json());
  index = buildIndex(
    fixture.model,
    fixture.dims,
    fixture.notes.map((note) => ({ id: note.id, vector: note.vector, text: note.text })),
  );
  return { fixture, index };
}

const topicOf = (loaded: Fixture, id: string): string =>
  loaded.notes.find((note) => note.id === id)?.topic ?? "?";

const textOf = (loaded: Fixture, id: string): string =>
  loaded.notes.find((note) => note.id === id)?.text ?? "";

export async function search(queryId: string): Promise<PageResult> {
  const { fixture: loaded, index: built } = await ready();
  const query = loaded.queries.find((candidate) => candidate.id === queryId);
  if (!query) throw new Error(`no query ${queryId}`);

  const started = performance.now();
  const semantic = searchIndex(built, query.vector, 5);
  const keyword = loaded.notes
    .map((note) => ({ id: note.id, score: keywordScore(note.text, query.text) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 5);

  const queryBytes = toInt8(query.vector);
  const approximate = topK(
    loaded.notes.map((note) => ({ id: note.id, score: int8Cosine(queryBytes, toInt8(note.vector)) })),
    5,
  );
  const searchMs = performance.now() - started;

  const semanticIds = new Set(semantic.map((row) => row.id));
  const floatBytes = loaded.notes.length * loaded.dims * 4;
  const int8Bytes = loaded.notes.length * loaded.dims;

  return {
    query: query.text,
    semantic: semantic.map((row) => ({
      id: row.id,
      topic: topicOf(loaded, row.id),
      text: textOf(loaded, row.id),
      score: row.score,
    })),
    keyword: keyword.map((row) => ({
      id: row.id,
      topic: topicOf(loaded, row.id),
      text: textOf(loaded, row.id),
      score: row.score,
    })),
    semanticHits: semantic.filter((row) => topicOf(loaded, row.id) === query.topic).length,
    keywordHits: keyword.filter((row) => topicOf(loaded, row.id) === query.topic).length,
    int8Keeps: approximate.filter((row) => semanticIds.has(row.id)).length,
    searchMs,
    floatBytes,
    int8Bytes,
  };
}

declare global {
  interface Window {
    __search: (queryId: string) => Promise<PageResult>;
    __lastSearch?: PageResult;
  }
}

function renderList(rows: readonly Row[]): string {
  return rows
    .map(
      (row) =>
        `<li><span class="score">${row.score.toFixed(3)}</span> ` +
        `<span class="topic">${row.topic}</span> ${row.text.slice(0, 76)}</li>`,
    )
    .join("");
}

function render(result: PageResult): string {
  return [
    `<p class="query">"${result.query}"</p>`,
    `<div class="columns">`,
    `<section><h2>by meaning</h2><ol>${renderList(result.semantic)}</ol></section>`,
    `<section><h2>by words</h2><ol>${renderList(result.keyword)}</ol></section>`,
    `</div>`,
    `<p class="summary">${result.semanticHits}/5 from the right subject, against ${result.keywordHits}/5 for words. ` +
      `int8 keeps ${result.int8Keeps}/5 of the same notes at ${(result.floatBytes / 1024).toFixed(0)} kB → ` +
      `${(result.int8Bytes / 1024).toFixed(0)} kB. ${result.searchMs.toFixed(1)} ms.</p>`,
  ].join("");
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLDivElement>("#out");
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-query]"));
  const all = buttons;

  const run = async (queryId: string): Promise<void> => {
    all.forEach((button) => (button.disabled = true));
    if (status) status.textContent = "searching forty notes, no network...";
    try {
      const result = await search(queryId);
      window.__lastSearch = result;
      if (status) status.textContent = `${result.semanticHits}/5 by meaning against ${result.keywordHits}/5 by words`;
      if (output) output.innerHTML = render(result);
    } catch (error) {
      if (status) status.textContent = `failed: ${(error as Error).message}`;
    } finally {
      all.forEach((button) => (button.disabled = false));
    }
  };

  window.__search = search;
  for (const button of buttons) {
    button.addEventListener("click", () => void run(button.dataset.query ?? "q1"));
  }
}
