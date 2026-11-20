/**
 * The OPFS implementation, and the worker that holds a synchronous handle.
 *
 * Everything here is behind a `typeof` guard, because this file is imported by a program that
 * also runs in node. A module that cannot be loaded in the runtime next door is a module that
 * cannot be tested, and this chapter's whole argument is that the port makes the storage
 * interchangeable.
 */

import { QuotaExceeded, assertEntryShape, type Entry, type Storage } from "./storage.ts";

type DirHandle = FileSystemDirectoryHandle;

/** OPFS is available when `navigator.storage.getDirectory` answers. */
export async function opfsAvailable(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const storage = navigator.storage as StorageManager | undefined;
  if (typeof storage?.getDirectory !== "function") return false;
  try {
    await storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}

/**
 * The same five operations as `MemoryStorage`, over the origin private file system.
 *
 * The store lives in a subdirectory so the capstone does not fight with anything else on the
 * origin, and it never deletes the directory: a store that removes itself on close is a cache.
 */
export class OpfsStorage implements Storage {
  private readonly root: DirHandle;

  private constructor(root: DirHandle) {
    this.root = root;
  }

  static async open(directory = "zero-backend"): Promise<OpfsStorage> {
    if (typeof navigator === "undefined" || typeof navigator.storage?.getDirectory !== "function") {
      throw new Error("OPFS: this runtime has no navigator.storage.getDirectory");
    }
    const origin = await navigator.storage.getDirectory();
    const root = await origin.getDirectoryHandle(directory, { create: true });
    return new OpfsStorage(root);
  }

  async write(name: string, data: Uint8Array): Promise<void> {
    try {
      const handle = await this.root.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      // A fresh copy, because the writable stream wants an ArrayBuffer-backed view.
      await writable.write(new Uint8Array(data));
      await writable.close();
    } catch (error) {
      const message = (error as Error).message ?? "";
      if (/quota|space/i.test(message)) {
        throw new QuotaExceeded(data.byteLength, 0);
      }
      throw error;
    }
  }

  async read(name: string): Promise<Uint8Array> {
    const handle = await this.root.getFileHandle(name);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async list(): Promise<readonly Entry[]> {
    const entries: Entry[] = [];
    for await (const [name, handle] of this.root.entries()) {
      if (handle.kind !== "file") {
        entries.push({ name, bytes: 0, kind: "dir", modifiedMs: 0 });
        continue;
      }
      const file = await (handle as FileSystemFileHandle).getFile();
      const entry: Entry = { name, bytes: file.size, kind: "file", modifiedMs: file.lastModified };
      assertEntryShape(entry);
      entries.push(entry);
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async remove(name: string): Promise<void> {
    await this.root.removeEntry(name);
  }

  async stat(name: string): Promise<Entry> {
    const handle = await this.root.getFileHandle(name);
    const file = await handle.getFile();
    const entry: Entry = { name, bytes: file.size, kind: "file", modifiedMs: file.lastModified };
    assertEntryShape(entry);
    return entry;
  }
}

/**
 * A worker that writes with a synchronous handle.
 *
 * `createSyncAccessHandle` is exposed only in a dedicated worker, which is why this chapter has
 * a worker in it even though the asynchronous API would do. A synchronous write from the main
 * thread would block the compositor; from a worker it blocks only the worker, and that is the
 * whole reason the API exists.
 */
export const SYNC_WORKER_SOURCE = `
self.onmessage = async (event) => {
  const { name, bytes } = event.data;
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("zero-backend", { create: true });
  const handle = await dir.getFileHandle(name, { create: true });
  const access = await handle.createSyncAccessHandle();
  try {
    access.write(new Uint8Array(bytes), { at: 0 });
    access.flush();
  } finally {
    access.close();
  }
  self.postMessage({ ok: true, bytes: access ? 0 : bytes.length });
};
`;

/** Runs the sync worker and resolves when it has flushed. */
export async function readWithSyncHandle(name: string, bytes: Uint8Array): Promise<void> {
  if (typeof Worker === "undefined") {
    throw new Error("sync handle: this runtime has no Worker");
  }
  const url = URL.createObjectURL(new Blob([SYNC_WORKER_SOURCE], { type: "text/javascript" }));
  const worker = new Worker(url);
  try {
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = () => resolve();
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage({ name, bytes: [...bytes] });
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}
