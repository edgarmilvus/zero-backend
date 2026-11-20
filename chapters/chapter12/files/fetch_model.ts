/**
 * Downloads the weights into the cache the page serves, and writes the manifest beside this file.
 *
 *   npm i -D @huggingface/transformers@4.3.2
 *   node chapters/chapter12/files/fetch_model.ts
 *
 * It is the same model chapter 11 measured, fetched by the same adapter, so the two chapters cannot
 * disagree about which build the numbers belong to.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MODEL_DIMS, MODEL_DTYPE, MODEL_ID, loadModel } from "../../chapter11/files/embed.ts";
import { REQUIRED, validateManifest } from "./manifest.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "..", "..", "..", "node_modules", "@huggingface", "transformers", ".cache", MODEL_ID);

export async function main(): Promise<number> {
  try {
    await loadModel();
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  if (!existsSync(CACHE)) {
    console.error(`the model loaded but the cache is not at ${CACHE}; is the version the one in package.json?`);
    return 1;
  }

  const files = REQUIRED.map((path) => ({ path, bytes: statSync(join(CACHE, path)).size }));
  const manifest = validateManifest(
    JSON.parse(
      JSON.stringify({
        model: MODEL_ID,
        dtype: MODEL_DTYPE,
        dims: MODEL_DIMS,
        files,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      }),
    ),
  );

  writeFileSync(join(HERE, "model.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`model             ${manifest.model}`);
  console.log(`files             ${manifest.files.length}`);
  console.log(`bytes             ${manifest.totalBytes}`);
  console.log(`manifest          ${join(HERE, "model.json")}`);

  return readFileSync(join(HERE, "model.json"), "utf8").includes("model_quantized.onnx") ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
