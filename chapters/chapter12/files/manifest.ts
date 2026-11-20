/**
 * The model manifest: what has to be on disk before a page may claim it can embed.
 *
 * The files are not an implementation detail. A missing tokenizer produces a model that loads and
 * returns vectors for the wrong tokens; a manifest that lists what it needs is the difference between
 * a page that says "the model is not here, run the fetch" and a page that answers with confidence.
 */

export const REQUIRED = ["config.json", "tokenizer.json", "onnx/model_quantized.onnx"] as const;

export type ModelFile = { readonly path: string; readonly bytes: number };
export type Manifest = {
  readonly model: string;
  readonly dtype: "q8" | "fp32";
  readonly dims: number;
  readonly files: readonly ModelFile[];
  readonly totalBytes: number;
};

type Bag = Record<string, unknown>;

export function validateManifest(raw: unknown): Manifest {
  if (typeof raw !== "object" || raw === null) throw new Error("manifest: expected an object");
  const root = raw as Bag;

  if (typeof root.model !== "string" || root.model.trim() === "") {
    throw new Error("manifest.model: expected the model id");
  }
  if (root.dtype !== "q8" && root.dtype !== "fp32") {
    throw new Error(`manifest.dtype: expected q8 or fp32, got ${String(root.dtype)}`);
  }
  if (typeof root.dims !== "number" || !Number.isInteger(root.dims) || root.dims <= 0) {
    throw new Error("manifest.dims: expected a positive integer");
  }
  if (!Array.isArray(root.files) || root.files.length === 0) {
    throw new Error("manifest.files: expected at least one file");
  }

  const files = root.files.map((entry, index) => {
    const file = entry as Bag;
    if (typeof file.path !== "string" || file.path === "") throw new Error(`manifest.files[${index}].path: missing`);
    if (typeof file.bytes !== "number" || !Number.isInteger(file.bytes) || file.bytes <= 0) {
      throw new Error(`manifest.files[${index}].bytes: expected a positive integer`);
    }
    return { path: file.path, bytes: file.bytes };
  });

  for (const required of REQUIRED) {
    if (!files.some((file) => file.path === required)) {
      throw new Error(`manifest.files: missing ${required}; the model cannot run without it`);
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (root.totalBytes !== undefined && root.totalBytes !== totalBytes) {
    throw new Error(`manifest.totalBytes: ${String(root.totalBytes)} but the files sum to ${totalBytes}`);
  }

  return { model: root.model, dtype: root.dtype, dims: root.dims, files, totalBytes };
}

/** A manifest is a claim about a model; the index's model must be the same one. */
export function assertSameModel(manifest: Manifest, model: string, dims: number): void {
  if (manifest.model !== model) {
    throw new Error(`manifest: ${manifest.model} on disk, ${model} asked for; fetch the right weights`);
  }
  if (manifest.dims !== dims) throw new Error(`manifest: ${manifest.dims} dimensions, the index has ${dims}`);
}
