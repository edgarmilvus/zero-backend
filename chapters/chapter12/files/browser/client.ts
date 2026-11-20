/**
 * The page: one worker that owns the model, one button that measures it, and the search that the
 * vectors make possible.
 *
 * The frame monitor is the chapter's instrument. It records the gap between animation frames while
 * the model loads, so "the worker keeps the page responsive" is a number and not a claim.
 */

import { fromJson, type Fixture } from "../../../chapter11/files/fixture.ts";
import { buildIndex, searchIndex } from "../../../chapter11/files/index.ts";

const TRANSFORMERS = "/vendor/@huggingface/transformers/dist/transformers.web.js";

type FrameStats = { readonly frames: number; readonly maxGapMs: number };

export type WarmResult = { readonly loadMs: number; readonly frames: FrameStats; readonly mode: "worker" };
export type MainThreadResult = { readonly loadMs: number; readonly frames: FrameStats; readonly mode: "main" };
export type SearchResult = {
  readonly text: string;
  readonly embedMs: number;
  readonly searchMs: number;
  readonly dims: number;
  readonly hits: readonly { id: string; topic: string; score: number; text: string }[];
};

/** Counts frames and the longest gap between them, from now until `stop()` is called. */
function monitorFrames(): { stop: () => FrameStats } {
  // The start and the end are timestamps too. A monitor that only looks at recorded frames cannot
  // see a freeze at the end of the window: the frames simply stop, and the gap between the last one
  // and the end is the very number the instrument exists to find.
  const stamps: number[] = [performance.now()];
  let running = true;
  const tick = (at: number): void => {
    if (!running) return;
    stamps.push(at);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    stop: () => {
      running = false;
      stamps.push(performance.now());
      let maxGapMs = 0;
      for (let index = 1; index < stamps.length; index += 1) {
        maxGapMs = Math.max(maxGapMs, (stamps[index] as number) - (stamps[index - 1] as number));
      }
      return { frames: stamps.length, maxGapMs };
    },
  };
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
const pending = new Map<number, Pending>();
let nextId = 1;
let worker: Worker | null = null;
let fixture: Fixture | null = null;

function openWorker(): Worker {
  if (worker) return worker;
  worker = new Worker("./embed-worker.ts", { type: "module" });
  worker.onmessage = (event: MessageEvent) => {
    const message = event.data as { type: string; id?: number; [key: string]: unknown };
    if (message.type === "ready") {
      for (const [id, entry] of pending) {
        if (id < 0) {
          pending.delete(id);
          entry.resolve(message);
        }
      }
      return;
    }
    const id = message.id ?? 0;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (message.type === "error") entry.reject(new Error(String(message.message)));
    else entry.resolve(message);
  };
  return worker;
}

function send<T>(message: Record<string, unknown>, id: number): Promise<T> {
  const target = openWorker();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    target.postMessage(message);
  });
}

/** Spawns the worker and leaves it idle, so the first user query does not pay for the load. */
export async function warmWorker(): Promise<WarmResult> {
  const monitor = monitorFrames();
  const started = performance.now();
  const reply = await send<{ loadMs: number }>({ type: "warm" }, -1);
  const loadMs = performance.now() - started;
  return { loadMs: Math.max(loadMs, reply.loadMs), frames: monitor.stop(), mode: "worker" };
}

/** The same warm-up on the page's own thread, measured with the same instrument. */
export async function warmMainThread(): Promise<MainThreadResult> {
  const monitor = monitorFrames();
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
  module.env.allowRemoteModels = false;
  module.env.allowLocalModels = true;
  module.env.localModelPath = "/models/";
  module.env.backends.onnx.wasm.wasmPaths = "/vendor/onnxruntime-web/dist/";
  await module.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
  return { loadMs: performance.now() - started, frames: monitor.stop(), mode: "main" };
}

async function corpus(): Promise<Fixture> {
  if (fixture) return fixture;
  const response = await fetch("../../../chapter11/files/embeddings.json");
  if (!response.ok) throw new Error(`embeddings.json: HTTP ${response.status}`);
  fixture = fromJson(await response.json());
  return fixture;
}

/** The product: a text the user typed, embedded in the worker, searched against the corpus. */
export async function searchText(text: string): Promise<SearchResult> {
  const loaded = await corpus();
  const id = nextId++;
  const reply = await send<{ dims: number; vectors: Float32Array[]; ms: number }>(
    { type: "embed", id, texts: [text] },
    id,
  );

  const vector = reply.vectors[0];
  if (!vector) throw new Error("the worker returned no vector");

  const index = buildIndex(
    loaded.model,
    loaded.dims,
    loaded.notes.map((note) => ({ id: note.id, vector: note.vector })),
  );

  const started = performance.now();
  const hits = searchIndex(index, vector, 5).map((hit) => {
    const note = loaded.notes.find((candidate) => candidate.id === hit.id);
    return {
      id: hit.id,
      topic: note?.topic ?? "?",
      score: hit.score,
      text: note?.text ?? "",
    };
  });
  const searchMs = performance.now() - started;

  return { text, embedMs: reply.ms, searchMs, dims: reply.dims, hits };
}

declare global {
  interface Window {
    __warm: () => Promise<WarmResult>;
    __main: () => Promise<MainThreadResult>;
    __searchText: (text: string) => Promise<SearchResult>;
    __lastEmbedSearch?: SearchResult;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const input = document.querySelector<HTMLTextAreaElement>("#text");
  const warm = document.querySelector<HTMLButtonElement>("#warm");
  const main = document.querySelector<HTMLButtonElement>("#main");
  const search = document.querySelector<HTMLButtonElement>("#search");

  const busy = (label: string, fn: () => Promise<void>): (() => void) => {
    let running = false;
    return () => {
      if (running) return;
      running = true;
      if (status) status.textContent = label;
      fn().finally(() => {
        running = false;
      });
    };
  };

  const renderSearch = (result: SearchResult): string =>
    [
      `"${result.text}"`,
      `embedded          ${result.dims} dims in ${result.embedMs.toFixed(0)} ms, in the worker`,
      `searched          ${result.hits.length} notes in ${result.searchMs.toFixed(2)} ms`,
      "",
      ...result.hits.map(
        (hit) => `  ${hit.score.toFixed(3)}  ${hit.id.padEnd(4)} ${hit.topic.padEnd(8)} ${hit.text.slice(0, 64)}`,
      ),
    ].join("\n");

  warm?.addEventListener(
    "click",
    busy("loading 23 MB of weights in a worker...", async () => {
      const result = await warmWorker();
      if (status) {
        status.textContent = `ready in ${result.loadMs.toFixed(0)} ms, longest frame ${result.frames.maxGapMs.toFixed(0)} ms`;
      }
      if (output) {
        output.textContent =
          `worker            ${result.loadMs.toFixed(0)} ms to ready\n` +
          `frames            ${result.frames.frames} during the load, longest gap ${result.frames.maxGapMs.toFixed(0)} ms\n` +
          `the page kept painting while the model compiled`;
      }
    }),
  );

  main?.addEventListener(
    "click",
    busy("loading the same model on the main thread...", async () => {
      const result = await warmMainThread();
      if (status) {
        status.textContent = `main thread: ${result.loadMs.toFixed(0)} ms, longest frame ${result.frames.maxGapMs.toFixed(0)} ms`;
      }
      if (output) {
        output.textContent =
          `main thread       ${result.loadMs.toFixed(0)} ms to ready\n` +
          `frames            ${result.frames.frames} during the load, longest gap ${result.frames.maxGapMs.toFixed(0)} ms\n` +
          `the same work, on the thread that draws`;
      }
    }),
  );

  search?.addEventListener(
    "click",
    busy("embedding your text in the worker...", async () => {
      const text = input?.value.trim() || "where do my files go when I close the tab";
      const result = await searchText(text);
      window.__lastEmbedSearch = result;
      if (status) {
        status.textContent = `embedded in ${result.embedMs.toFixed(0)} ms, ${result.hits.length} notes in ${result.searchMs.toFixed(2)} ms`;
      }
      if (output) output.textContent = renderSearch(result);
    }),
  );

  window.__warm = warmWorker;
  window.__main = warmMainThread;
  window.__searchText = searchText;
}
