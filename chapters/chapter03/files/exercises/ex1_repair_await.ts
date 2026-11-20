/**
 * Exercise 1 - the write that was never awaited.
 *
 * The loop fires ninety-six writes and navigates away. Four files survive, because the rest
 * were still queued when the document was destroyed: an unawaited write is not a write, it is
 * a request. The repair is one `await` and a comment explaining why it is not slow.
 */

import { MemoryStorage, type Storage } from "../storage.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

/** A store that answers after `ticks` timer turns, so "not awaited" is observable. */
export class SlowStore implements Storage {
  readonly inner = new MemoryStorage(1e9);
  private ticks: number;

  constructor(ticks = 2) {
    this.ticks = ticks;
  }

  async write(name: string, data: Uint8Array): Promise<void> {
    for (let turn = 0; turn < this.ticks; turn += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    await this.inner.write(name, data);
  }

  read(name: string): Promise<Uint8Array> {
    return this.inner.read(name);
  }

  list() {
    return this.inner.list();
  }

  remove(name: string): Promise<void> {
    return this.inner.remove(name);
  }

  stat(name: string) {
    return this.inner.stat(name);
  }
}

const FILES = 6;

/** The bug: fire the writes and return, as a `forEach` with an async callback does. */
export async function fireAndForget(store: Storage): Promise<number> {
  for (let index = 0; index < FILES; index += 1) {
    void store.write(`f${index}.bin`, new Uint8Array([index]));
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return (await store.list()).length;
}

/** The repair: await each write, so the loop is a sequence of completed writes. */
export async function awaited(store: Storage): Promise<number> {
  for (let index = 0; index < FILES; index += 1) {
    await store.write(`f${index}.bin`, new Uint8Array([index]));
  }
  return (await store.list()).length;
}

export const checks: readonly Check[] = [
  {
    name: "the unawaited loop loses files",
    run: async () => eq(await fireAndForget(new SlowStore()), 0, "files visible"),
  },
  {
    name: "the awaited loop writes all six",
    run: async () => eq(await awaited(new SlowStore()), FILES, "files visible"),
  },
  {
    name: "waiting long enough would save the unawaited ones, which is the trap",
    run: async () => {
      const store = new SlowStore();
      await fireAndForget(store);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      return eq((await store.list()).length, FILES, "files after a wait");
    },
  },
  {
    name: "every awaited write is complete before the next starts",
    run: async () => {
      const store = new SlowStore(1);
      const seen: number[] = [];
      for (let index = 0; index < FILES; index += 1) {
        await store.write(`g${index}.bin`, new Uint8Array([index]));
        seen.push((await store.list()).length);
      }
      return eq(seen.join(","), "1,2,3,4,5,6", "running count");
    },
  },
  {
    name: "the repair does not depend on a timer",
    run: async () => {
      const store = new SlowStore(3);
      const started = Date.now();
      await awaited(store);
      return expect(Date.now() - started < 1000, "too slow");
    },
  },
  {
    name: "the file that did survive is the one that was awaited first",
    run: async () => {
      const store = new SlowStore(2);
      await store.write("first.bin", new Uint8Array([0]));
      void store.write("rest.bin", new Uint8Array([1]));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const names = (await store.list()).map((entry) => entry.name);
      return eq(names.join(","), "first.bin", "names");
    },
  },
  {
    name: "an awaited batch is idempotent",
    run: async () => {
      const store = new SlowStore(1);
      await awaited(store);
      await awaited(store);
      return eq((await store.list()).length, FILES, "files");
    },
  },
  {
    name: "the count is the number of writes, not the number of attempts",
    run: async () => {
      const store = new SlowStore(1);
      const attempted = FILES;
      const landed = await awaited(store);
      return eq(landed, attempted, "landed");
    },
  },
];

export async function main(): Promise<number> {
  console.log(`fire and forget   ${await fireAndForget(new SlowStore())} of ${FILES} files`);
  console.log(`awaited           ${await awaited(new SlowStore())} of ${FILES} files`);
  console.log("");
  console.log("an unawaited write is a request, and a navigation cancels requests");
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
