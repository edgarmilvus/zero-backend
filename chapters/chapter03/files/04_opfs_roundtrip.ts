/**
 * Example 4 - the same script against OPFS, or an honest refusal.
 *
 *   node chapters/chapter03/files/04_opfs_roundtrip.ts
 *
 * In node this prints a refusal and runs the memory store instead, which is the behaviour a
 * reader needs on a browser without OPFS. In the page it runs the real thing, and the bytes it
 * writes are still there after a reload: that is the difference between a store and a cache.
 */

import { MemoryStorage, totalBytes, type Storage } from "./storage.ts";
import { opfsAvailable, OpfsStorage } from "./opfs.ts";
import { renderInventory, renderThroughput } from "./report.ts";

export async function main(): Promise<number> {
  const available = await opfsAvailable();
  let store: Storage;
  let label: string;

  if (available) {
    store = await OpfsStorage.open();
    label = "opfs";
  } else {
    store = new MemoryStorage(64 * 1e6);
    label = "memory (this runtime has no OPFS)";
  }

  console.log(`store            ${label}`);
  console.log("");

  const blob = new Uint8Array(512 * 1024).fill(7);
  const started = performance.now();
  for (let index = 0; index < 4; index += 1) {
    await store.write(`chunk-${index}.bin`, blob);
  }
  const wallClockMs = performance.now() - started;

  const entries = await store.list();
  console.log(renderThroughput("four 512 kB writes", totalBytes(entries), wallClockMs));
  console.log("");
  console.log(renderInventory(entries));
  console.log("");

  const back = await store.read("chunk-2.bin");
  const same = back.byteLength === blob.byteLength && back[0] === 7;
  console.log(`read back        ${back.byteLength} bytes, first byte ${back[0]} (${same})`);
  console.log(
    available
      ? "reload the page: these four files are still here, because OPFS is a filesystem"
      : "run this in the browser page of this chapter to see the same four files survive a reload",
  );

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
