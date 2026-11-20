/**
 * Example 5 - the index from the last model.
 *
 *   node chapters/chapter11/files/05_stale.ts
 *
 * Two indexes hold the same numbers and one is called by a newer model. Nothing about the array is
 * wrong; the coordinates are. The program shows the refusal, because the alternative is a page that
 * answers every question with confidence and is wrong about all of them.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadFixture } from "./fixture.ts";
import { assertCompatible, buildIndex } from "./index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export async function main(): Promise<number> {
  const fixture = await loadFixture(join(HERE, "embeddings.json"));
  const index = buildIndex(fixture.model, fixture.dims, fixture.notes.map((note) => ({
    id: note.id,
    vector: note.vector,
  })));

  console.log(`index built by    ${index.modelId}, ${index.dims} dimensions`);
  console.log(`query embedded by ${fixture.model}, ${fixture.dims} dimensions`);
  console.log("");

  assertCompatible(index, fixture.model, fixture.dims);
  console.log("the ids match, so the query runs");

  let refusals = 0;
  for (const stale of ["Xenova/all-MiniLM-L12-v2", "Xenova/bge-small-en-v1.5"]) {
    try {
      assertCompatible(index, stale, fixture.dims);
      console.error(`a query from ${stale} was accepted, which is the bug`);
      return 1;
    } catch (error) {
      refusals += 1;
      console.log(`refused           ${(error as Error).message}`);
    }
  }

  try {
    assertCompatible(index, fixture.model, 768);
    console.error("a 768-dimension query was accepted, which is the bug");
    return 1;
  } catch (error) {
    refusals += 1;
    console.log(`refused           ${(error as Error).message}`);
  }

  console.log("");
  console.log(`${refusals} refusals: the model id and the dimensions travel with the index`);

  return refusals === 3 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
