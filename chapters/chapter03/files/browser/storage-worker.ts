/**
 * The sync handle, in the only place it exists.
 *
 * `createSyncAccessHandle` is exposed in dedicated workers and nowhere else, which is why this
 * file is a module and not a function inside the page. The page posts a name and the bytes; the
 * worker writes them with a synchronous handle, flushes, and answers.
 */

export type WriteRequest = { readonly name: string; readonly bytes: number[] };

/** The part of a sync access handle this file uses, and the handle that exposes it. */
type SyncHandle = {
  write(data: Uint8Array, options?: { at?: number }): number;
  flush(): void;
  close(): void;
};

type FileHandleWithSync = FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<SyncHandle>;
};

self.onmessage = async (event: MessageEvent) => {
  const { name, bytes } = event.data as WriteRequest;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("zero-backend", { create: true });
    const handle = (await dir.getFileHandle(name, { create: true })) as FileHandleWithSync;
    const access = await handle.createSyncAccessHandle();
    try {
      const view = new Uint8Array(bytes);
      access.write(view, { at: 0 });
      access.flush();
      self.postMessage({ ok: true, name, written: view.byteLength });
    } finally {
      access.close();
    }
  } catch (error) {
    self.postMessage({ ok: false, name, error: (error as Error).message });
  }
};
