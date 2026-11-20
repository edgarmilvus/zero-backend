/**
 * The page: the port, the queue, and one write through a synchronous handle.
 *
 * It imports the same modules the harness tests, so the page and the book cannot drift. The one
 * thing it adds is the reload: click, reload, and the files are still listed, which is the
 * difference between a store and a cache.
 */

import { MemoryStorage, totalBytes, type Storage } from "../storage.ts";
import { createScheduler, type Job } from "../queue.ts";
import { opfsAvailable, OpfsStorage, readWithSyncHandle } from "../opfs.ts";
import { renderInventory, renderThroughput } from "../report.ts";

export type PageState = {
  readonly store: string;
  readonly files: number;
  readonly bytes: number;
  readonly throughput: string;
  readonly queue: { readonly done: number; readonly peak: number };
  readonly inventory: string;
};

let cached: Storage | null = null;

async function openStore(): Promise<{ store: Storage; label: string }> {
  if (cached) return { store: cached, label: (cached as { label?: string }).label ?? "store" };
  if (await opfsAvailable()) {
    const store = await OpfsStorage.open();
    (store as { label?: string }).label = "opfs";
    cached = store;
    return { store, label: "opfs" };
  }
  const store = new MemoryStorage(64 * 1e6);
  (store as { label?: string }).label = "memory";
  cached = store;
  return { store, label: "memory" };
}

/** The whole chapter in one call, so a recorder drives the same path a reader drives. */
export async function runHere(): Promise<PageState> {
  const { store, label } = await openStore();

  const jobs: Job<number>[] = Array.from({ length: 8 }, (_, index) => ({
    id: `job-${index + 1}`,
    run: async () => {
      const payload = new Uint8Array(64 * 1024).fill(index);
      await store.write(`job-${index + 1}.bin`, payload);
      return payload.byteLength;
    },
  }));

  const started = performance.now();
  const scheduler = createScheduler(4, jobs);
  const stats = await scheduler.drain();
  const wallClockMs = performance.now() - started;

  const entries = await store.list();
  const throughput = renderThroughput("eight 64 kB writes", totalBytes(entries), wallClockMs);

  return {
    store: label,
    files: entries.length,
    bytes: totalBytes(entries),
    throughput,
    queue: { done: stats.done, peak: stats.peakRunning },
    inventory: renderInventory(entries),
  };
}

/** The inventory without writing anything: what a reload has to preserve. */
export async function listHere(): Promise<{ store: string; files: number; bytes: number; inventory: string }> {
  const { store, label } = await openStore();
  const entries = await store.list();
  return {
    store: label,
    files: entries.length,
    bytes: totalBytes(entries),
    inventory: renderInventory(entries),
  };
}

/** One write through the worker and its synchronous handle, when the engine has both. */
export async function syncWrite(): Promise<string> {
  if (!(await opfsAvailable())) return "no OPFS here: the sync handle has nothing to open";
  if (typeof Worker === "undefined") return "no Worker here: the sync handle is not exposed";
  try {
    await readWithSyncHandle("sync-probe.bin", new Uint8Array(1024).fill(5));
    return "wrote sync-probe.bin with a synchronous handle, inside a worker";
  } catch (error) {
    return `sync handle failed: ${(error as Error).message}`;
  }
}

declare global {
  interface Window {
    __chapter3: () => Promise<{ state: PageState; sync: string }>;
    __chapter3list: () => Promise<{ store: string; files: number; bytes: number; inventory: string }>;
  }
}

if (typeof window !== "undefined") {
  const output = document.querySelector<HTMLPreElement>("#out");
  const summary = document.querySelector<HTMLParagraphElement>("#status");

  const render = async (): Promise<void> => {
    const state = await runHere();
    if (summary) {
      summary.textContent = `${state.store}: ${state.files} files, ${state.bytes} bytes, peak ${state.queue.peak} jobs`;
    }
    if (output) output.textContent = `${state.inventory}\n\n${state.throughput}`;
  };

  window.__chapter3 = async () => ({ state: await runHere(), sync: await syncWrite() });
  window.__chapter3list = () => listHere();

  document.querySelector<HTMLButtonElement>("#run")?.addEventListener("click", () => void render());
  document.querySelector<HTMLButtonElement>("#sync")?.addEventListener("click", () => {
    void syncWrite().then((line) => {
      if (output) output.textContent = `${output.textContent ?? ""}\n\n${line}`;
    });
  });

  void render();
}
