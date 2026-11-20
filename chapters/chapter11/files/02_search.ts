/**
 * Example 2 - two searches over the same forty notes.
 *
 *   node chapters/chapter11/files/02_search.ts
 *
 * The keyword one counts words the query shares with the note, which is what a `like '%word%'` does.
 * The semantic one compares vectors. The corpus has four subjects and each query names one, so the
 * top five is either from the right subject or it is not, and the difference is a number.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadFixture, evaluate } from "./fixture.ts";
import { buildIndex, searchIndex } from "./index.ts";
import { assertBetter, renderEvaluation, renderSearch, type Hit } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE = join(HERE, "embeddings.json");

export async function main(): Promise<number> {
  const fixture = await loadFixture(FIXTURE);
  const evaluation = evaluate(fixture, 5);

  console.log(`model             ${fixture.model} (${fixture.dtype}, ${fixture.dims} dims)`);
  console.log(`corpus            ${fixture.notes.length} notes, ${fixture.queries.length} queries`);
  console.log("");
  console.log(renderEvaluation(evaluation, 5));
  console.log("");

  for (const row of evaluation.perQuery) {
    const query = fixture.queries.find((candidate) => candidate.id === row.id);
    console.log(
      `  ${row.id}  semantic ${(row.semantic * 100).toFixed(0).padStart(3)}%  ` +
        `keyword ${(row.keyword * 100).toFixed(0).padStart(3)}%   ${query?.text ?? ""}`,
    );
  }

  const index = buildIndex(
    fixture.model,
    fixture.dims,
    fixture.notes.map((note) => ({ id: note.id, vector: note.vector, text: note.text })),
  );
  const first = fixture.queries[0];
  if (!first) throw new Error("the fixture has no queries");

  const started = performance.now();
  const hits = searchIndex(index, first.vector, 5, { modelId: fixture.model }).map<Hit>((hit) => {
    const note = fixture.notes.find((candidate) => candidate.id === hit.id);
    if (!note) throw new Error(`search returned ${hit.id}, which is not in the corpus`);
    return { ...hit, note };
  });
  const searchMs = performance.now() - started;

  console.log("");
  console.log(renderSearch(first.text, hits, searchMs));
  console.log("");
  assertBetter(evaluation);
  console.log("meaning beats words on this corpus, and the margin is computed, not asserted by hand");

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
