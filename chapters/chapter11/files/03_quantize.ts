/**
 * Example 3 - the same index at a quarter of the bytes.
 *
 *   node chapters/chapter11/files/03_quantize.ts
 *
 * Every vector is stored twice: as 384 floats and as 384 signed bytes with one scale. The question is
 * not whether int8 is smaller — it is, four times — but whether the top five changed, which is what a
 * reader would notice.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadFixture } from "./fixture.ts";
import { buildIndex, searchIndex } from "./index.ts";
import { bytesOf, int8Cosine, recallAt, toInt8 } from "./quantize.ts";
import { renderBytes } from "./report.ts";
import { topK, type Scored } from "./vector.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export async function main(): Promise<number> {
  const fixture = await loadFixture(join(HERE, "embeddings.json"));
  const index = buildIndex(fixture.model, fixture.dims, fixture.notes.map((note) => ({
    id: note.id,
    vector: note.vector,
  })));

  const quantized = fixture.notes.map((note) => ({ id: note.id, vector: toInt8(note.vector) }));

  const exact: Scored[][] = [];
  const approximate: Scored[][] = [];

  const started = performance.now();
  for (const query of fixture.queries) {
    exact.push(searchIndex(index, query.vector, 5));

    const queryBytes = toInt8(query.vector);
    const scored = quantized.map((row) => ({ id: row.id, score: int8Cosine(queryBytes, row.vector) }));
    approximate.push(topK(scored, 5));
  }
  const searchMs = performance.now() - started;

  const recall = recallAt(exact, approximate, 5);
  const bytes = { float32: bytesOf(fixture.notes.length, "float32"), int8: bytesOf(fixture.notes.length, "int8") };

  console.log(renderBytes(bytes));
  console.log(`recall@5          ${(recall * 100).toFixed(0)} per cent`);
  console.log(`${fixture.queries.length} queries       ${searchMs.toFixed(2)} ms for both representations`);
  console.log("");
  console.log("the five notes a reader sees are mostly the same five, at a quarter of the bytes");

  if (recall < 0.9) {
    console.error(`recall ${(recall * 100).toFixed(0)} per cent is below the chapter's floor of 90`);
    return 1;
  }

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
