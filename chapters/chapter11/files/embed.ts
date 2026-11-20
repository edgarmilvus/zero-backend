/**
 * The model adapter: text in, 384 floats out.
 *
 * `@huggingface/transformers` runs the same ONNX build in node and in a page, which is why the
 * chapter can measure the model in the harness's language. It is also 287 megabytes of native runtime
 * as an install, so the chapter does not put it in the repository's dependencies: the import is
 * dynamic and the error says what to install.
 */

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const MODEL_DIMS = 384;
export const MODEL_DTYPE = "q8";
export const INSTALL_HINT = "npm i -D @huggingface/transformers@4.3.2";

export type Embedder = {
  embed(texts: readonly string[]): Promise<Float32Array[]>;
};

export type Loaded = {
  readonly embedder: Embedder;
  readonly loadMs: number;
};

/**
 * Loads the model, or throws with the command that installs it.
 *
 * The dynamic import is the point: a reader who only wants the index and the page never pays the
 * install, and a reader who wants the model meets one sentence instead of a stack trace about a
 * missing native binary.
 */
export async function loadModel(): Promise<Loaded> {
  const started = performance.now();

  let transformers: typeof import("@huggingface/transformers");
  try {
    transformers = await import("@huggingface/transformers");
  } catch {
    throw new Error(`the model adapter needs its package: ${INSTALL_HINT}`);
  }

  const extractor = await transformers.pipeline("feature-extraction", MODEL_ID, {
    dtype: MODEL_DTYPE,
  });

  const embedder: Embedder = {
    async embed(texts: readonly string[]): Promise<Float32Array[]> {
      const output = await extractor([...texts], { pooling: "mean", normalize: true });
      const dims = output.dims as [number, number];
      if (dims[1] !== MODEL_DIMS) {
        throw new Error(`the model returned ${dims[1]} dimensions, the index expects ${MODEL_DIMS}`);
      }
      const data = output.data as Float32Array;
      return Array.from({ length: dims[0] }, (_unused, row) =>
        data.slice(row * MODEL_DIMS, (row + 1) * MODEL_DIMS),
      );
    },
  };

  return { embedder, loadMs: performance.now() - started };
}

/** Embeds texts in batches, which is how a corpus of a few hundred notes stays under a second. */
export async function embedTexts(embedder: Embedder, texts: readonly string[], batch = 16): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let index = 0; index < texts.length; index += batch) {
    const slice = texts.slice(index, index + batch);
    out.push(...(await embedder.embed(slice)));
  }
  return out;
}
