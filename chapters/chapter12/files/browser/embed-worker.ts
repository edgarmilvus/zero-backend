/**
 * The worker: the model's process, away from the frame.
 *
 * A module worker does not inherit the document's import map, so the three bare specifiers inside
 * `transformers.web.js` are rewritten by the chapter's server and this file imports it by URL. The
 * alternative is a bundler, and the chapter measures why the worker is worth the trouble.
 */

const TRANSFORMERS = "/vendor/@huggingface/transformers/dist/transformers.web.js";
const MODEL = "Xenova/all-MiniLM-L6-v2";

type Request =
  | { readonly type: "warm" }
  | { readonly type: "embed"; readonly id: number; readonly texts: readonly string[] };

type Response =
  | { readonly type: "ready"; readonly loadMs: number; readonly model: string }
  | {
      readonly type: "result";
      readonly id: number;
      readonly dims: number;
      readonly vectors: Float32Array[];
      readonly ms: number;
    }
  | { readonly type: "error"; readonly id: number; readonly message: string };

const scope = self as unknown as {
  postMessage(message: Response, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<Request>) => void) | null;
};

let extractor: Promise<{ (texts: string[], options: object): Promise<{ dims: number[]; data: Float32Array }> }> | null = null;
let loadMs = 0;

/**
 * One pipeline per worker, for the same reason chapter 10 keeps one engine: the load is the cost and
 * the calls are not.
 */
async function pipeline(): Promise<NonNullable<typeof extractor>> {
  if (extractor) return extractor;

  const started = performance.now();
  const module = (await import(/* @vite-ignore */ TRANSFORMERS)) as {
    pipeline: (task: string, model: string, options: object) => Promise<unknown>;
    env: {
      allowRemoteModels: boolean;
      allowLocalModels: boolean;
      localModelPath: string;
      backends: { onnx: { wasm: { wasmPaths: string } } };
    };
  };

  // Offline by construction: the weights are the ones the install already downloaded, and a page
  // that silently falls back to a CDN is a page whose numbers depend on the network.
  module.env.allowRemoteModels = false;
  module.env.allowLocalModels = true;
  module.env.localModelPath = "/models/";
  module.env.backends.onnx.wasm.wasmPaths = "/vendor/onnxruntime-web/dist/";

  extractor = module.pipeline("feature-extraction", MODEL, { dtype: "q8" }) as NonNullable<typeof extractor>;
  const loaded = await extractor;
  loadMs = performance.now() - started;
  return loaded;
}

scope.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;

  try {
    if (request.type === "warm") {
      await pipeline();
      scope.postMessage({ type: "ready", loadMs, model: MODEL });
      return;
    }

    const extract = await pipeline();
    const started = performance.now();
    const output = await extract([...request.texts], { pooling: "mean", normalize: true });
    const ms = performance.now() - started;

    const [rows, dims] = output.dims as [number, number];
    const vectors = Array.from({ length: rows }, (_unused, row) =>
      output.data.slice(row * dims, (row + 1) * dims),
    );
    scope.postMessage(
      { type: "result", id: request.id, dims, vectors, ms },
      vectors.map((vector) => vector.buffer),
    );
  } catch (error) {
    scope.postMessage({ type: "error", id: request.type === "embed" ? request.id : -1, message: (error as Error).message });
  }
};
