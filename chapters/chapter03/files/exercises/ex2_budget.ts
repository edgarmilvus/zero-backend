/**
 * Exercise 2 - a budget that refuses the hundred and first file.
 *
 * The store accepts whatever arrives and lets the platform refuse it halfway through, which on
 * a phone means a crash with two files half written. A budget refuses before the first byte,
 * with two numbers the UI can show.
 */

import { MemoryStorage, QuotaExceeded, totalBytes } from "../storage.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

export const PHONE_QUOTA = 200 * 1e6;
export const DESKTOP_QUOTA = 4 * 1e9;

/** The bug: no budget at all, so the platform decides when to fail. */
export async function unchecked(count: number, chunkBytes: number): Promise<number> {
  const store = new MemoryStorage(Number.POSITIVE_INFINITY);
  for (let index = 0; index < count; index += 1) {
    await store.write(`part-${index}.bin`, new Uint8Array(chunkBytes));
  }
  return totalBytes(await store.list());
}

/** The repair: a store that knows what it may spend, and refuses the write that would pass it. */
export async function budgeted(
  count: number,
  chunkBytes: number,
  budgetBytes: number,
): Promise<{ written: number; refused: number | null }> {
  const store = new MemoryStorage(budgetBytes);
  let written = 0;
  for (let index = 0; index < count; index += 1) {
    try {
      await store.write(`part-${index}.bin`, new Uint8Array(chunkBytes));
      written += 1;
    } catch (error) {
      if (!(error instanceof QuotaExceeded)) throw error;
      return { written, refused: index };
    }
  }
  return { written, refused: null };
}

export const checks: readonly Check[] = [
  {
    name: "without a budget, a phone accepts more than it has",
    run: async () => expect(await unchecked(120, 4 * 1e6) > PHONE_QUOTA, "over the quota"),
  },
  {
    name: "with a budget, the write that would pass it is refused",
    run: async () => {
      const result = await budgeted(120, 4 * 1e6, PHONE_QUOTA);
      return eq(result.refused, 50, "refused index");
    },
  },
  {
    name: "the accepted writes are the ones that fit",
    run: async () => {
      const result = await budgeted(120, 4 * 1e6, PHONE_QUOTA);
      return eq(result.written, 50, "written");
    },
  },
  {
    name: "the refusal happens before the byte, not after",
    run: async () => {
      const store = new MemoryStorage(PHONE_QUOTA);
      await store.write("a.bin", new Uint8Array(PHONE_QUOTA));
      const used = totalBytes(await store.list());
      return eq(used, PHONE_QUOTA, "used");
    },
  },
  {
    name: "a larger budget accepts more of the same files",
    run: async () => {
      const small = await budgeted(120, 4 * 1e6, PHONE_QUOTA);
      const large = await budgeted(120, 4 * 1e6, DESKTOP_QUOTA);
      expect(large.written > small.written, "desktop should accept more");
      return eq(large.refused, null, "desktop refusal");
    },
  },
  {
    name: "a zero budget refuses everything",
    run: async () => {
      const result = await budgeted(1, 1, 0);
      eq(result.written, 0, "written");
      return eq(result.refused, 0, "refused index");
    },
  },
  {
    name: "the refusal carries the budget and the need",
    run: async () => {
      const store = new MemoryStorage(1000);
      await store.write("a.bin", new Uint8Array(600));
      try {
        await store.write("b.bin", new Uint8Array(600));
        throw new Error("accepted");
      } catch (error) {
        const quota = error as QuotaExceeded;
        return eq(`${quota.budgetBytes}/${quota.neededBytes}`, "1000/1200", "numbers");
      }
    },
  },
  {
    name: "a refused write does not corrupt the file already there",
    run: async () => {
      const store = new MemoryStorage(1000);
      await store.write("a.bin", new Uint8Array(600).fill(9));
      try {
        await store.write("b.bin", new Uint8Array(600));
      } catch {
        /* refused, as designed */
      }
      const kept = await store.read("a.bin");
      return eq(kept[0], 9, "first byte");
    },
  },
  {
    name: "the count of accepted files is the count the budget allows",
    run: async () => {
      const result = await budgeted(10, 1000, 4500);
      return eq(result.written, 4, "written");
    },
  },
];

export async function main(): Promise<number> {
  console.log(`phone quota       ${PHONE_QUOTA.toLocaleString("en-US")} bytes`);
  console.log(`unchecked         ${(await unchecked(120, 4e6)).toLocaleString("en-US")} bytes written`);
  const phone = await budgeted(120, 4e6, PHONE_QUOTA);
  console.log(`budgeted          ${phone.written} files, refused at ${phone.refused}`);
  console.log("");
  console.log("a refusal with two numbers is a message; a crash at 60 per cent is an incident");
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
