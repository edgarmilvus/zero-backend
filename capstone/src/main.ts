/**
 * The capstone, chapter 3: a store, a queue, and a list on the screen.
 *
 * It imports the modules the book publishes rather than copying them, so the app and the
 * listings cannot drift. Every later chapter adds a room to this file.
 */

import { MemoryStorage, totalBytes, type Storage } from "../../chapters/chapter03/files/storage.ts";
import { createScheduler, type Job } from "../../chapters/chapter03/files/queue.ts";
import { opfsAvailable, OpfsStorage } from "../../chapters/chapter03/files/opfs.ts";
import { renderInventory } from "../../chapters/chapter03/files/report.ts";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("the capstone needs an #app element");

app.innerHTML = `
  <h1>Zero Backend</h1>
  <p class="lede">
    One static page with a filesystem. Eight files go in through a queue of four; reload and
    they are still here, because OPFS is a store and not a cache.
  </p>
  <p id="status">opening the store…</p>
  <p class="hint">
    Every number below comes from this tab. Nothing is uploaded: open the network panel and look.
  </p>
  <button id="write">Write eight files</button>
  <pre id="inventory"></pre>
`;

const status = app.querySelector<HTMLParagraphElement>("#status");
const inventory = app.querySelector<HTMLPreElement>("#inventory");
const write = app.querySelector<HTMLButtonElement>("#write");

async function openStore(): Promise<{ store: Storage; label: string }> {
  if (await opfsAvailable()) return { store: await OpfsStorage.open(), label: "opfs" };
  return { store: new MemoryStorage(64 * 1e6), label: "memory (this browser has no OPFS)" };
}

async function run(): Promise<void> {
  const { store, label } = await openStore();
  if (status) status.textContent = `store: ${label}`;

  const jobs: Job<number>[] = Array.from({ length: 8 }, (_, index) => ({
    id: `file-${index + 1}`,
    run: async () => {
      const payload = new Uint8Array(64 * 1024).fill(index);
      await store.write(`file-${index + 1}.bin`, payload);
      return payload.byteLength;
    },
  }));

  const scheduler = createScheduler(4, jobs);
  const stats = await scheduler.drain();
  const entries = await store.list();

  if (status) {
    status.textContent = `${entries.length} files, ${totalBytes(entries)} bytes, ${stats.done} jobs done, peak ${stats.peakRunning} at a time`;
  }
  if (inventory) inventory.textContent = renderInventory(entries);
}

write?.addEventListener("click", () => {
  void run();
});

void run();
