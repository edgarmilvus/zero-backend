/**
 * Generates `embeddings.json`: the model's output over the corpus, committed so the gate and the page
 * run offline.
 *
 *   npm i -D @huggingface/transformers@4.3.2
 *   node chapters/chapter11/files/make_embeddings.ts
 *
 * A fixture of vectors is a fixture of a model build: regenerate it when the model changes, and the
 * file's `model` field is what makes the regeneration not optional.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NOTES, QUERIES } from "./corpus.ts";
import { MODEL_DIMS, MODEL_DTYPE, MODEL_ID, embedTexts, loadModel } from "./embed.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EMBEDDINGS = join(HERE, "embeddings.json");

/** Five decimals: 384 floats at nine characters each is a 165 kB file, and five is more than cosine needs. */
const round = (values: Float32Array): number[] =>
  Array.from(values, (value) => Math.round(value * 100_000) / 100_000);

export async function main(): Promise<number> {
  const { embedder, loadMs } = await loadModel();

  const started = performance.now();
  const noteVectors = await embedTexts(embedder, NOTES.map((note) => note.text));
  const queryVectors = await embedTexts(embedder, QUERIES.map((query) => query.text));
  const embedMs = performance.now() - started;

  const fixture = {
    model: MODEL_ID,
    dtype: MODEL_DTYPE,
    dims: MODEL_DIMS,
    notes: NOTES.map((note, index) => ({
      id: note.id,
      topic: note.topic,
      text: note.text,
      vector: round(noteVectors[index] as Float32Array),
    })),
    queries: QUERIES.map((query, index) => ({
      id: query.id,
      topic: query.topic,
      text: query.text,
      vector: round(queryVectors[index] as Float32Array),
    })),
  };

  writeFileSync(EMBEDDINGS, `${JSON.stringify(fixture)}\n`);

  console.log(`model             ${MODEL_ID} (${MODEL_DTYPE})`);
  console.log(`load              ${loadMs.toFixed(0)} ms`);
  console.log(`embedded          ${NOTES.length + QUERIES.length} texts in ${embedMs.toFixed(0)} ms`);
  console.log(`dimensions        ${MODEL_DIMS}`);
  console.log(`file              ${EMBEDDINGS}`);
  console.log("");
  console.log("the vectors are committed, so the gate and the page never download the model");

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
