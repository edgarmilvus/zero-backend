/**
 * Example 1 - the model, in this process.
 *
 *   npm i -D @huggingface/transformers@4.3.2
 *   node chapters/chapter11/files/01_embed.ts
 *
 * This is the chapter's one program that needs a download: 23 megabytes of quantized model, cached
 * after the first run. The other examples read the vectors it produced, so a reader without a network
 * can still run the index, the search and the quantization.
 */

import { MODEL_DIMS, MODEL_ID, loadModel } from "./embed.ts";
import { cosine } from "./vector.ts";

const RELATED = "local-first software keeps the real copy on the device";
const PARAPHRASE = "the authoritative data lives on the user's machine, not on a server";
const UNRELATED = "the price of coffee in Milan on a Tuesday morning";

export async function main(): Promise<number> {
  let loaded;
  try {
    loaded = await loadModel();
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  const { embedder, loadMs } = loaded;
  const started = performance.now();
  const [related, paraphrase, unrelated] = await embedder.embed([RELATED, PARAPHRASE, UNRELATED]);
  const embedMs = performance.now() - started;

  if (!related || !paraphrase || !unrelated) throw new Error("the model returned fewer vectors than texts");

  console.log(`model             ${MODEL_ID} (${MODEL_DIMS} dims)`);
  console.log(`loaded in         ${loadMs.toFixed(0)} ms`);
  console.log(`three texts       ${embedMs.toFixed(0)} ms`);
  console.log("");
  console.log(`related           ${cosine(related, paraphrase).toFixed(3)}  the same idea, different words`);
  console.log(`unrelated         ${cosine(related, unrelated).toFixed(3)}  a different subject`);
  console.log("");
  console.log(`first component   ${related[0]?.toFixed(4)}, and ${MODEL_DIMS - 1} more like it`);

  return cosine(related, paraphrase) > cosine(related, unrelated) ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
