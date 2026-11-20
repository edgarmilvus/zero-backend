/**
 * Example 5 - the write that is refused before it starts.
 *
 *   node chapters/chapter03/files/05_quota.ts
 *
 * A one-megabyte store and six two-hundred-kilobyte files. The fifth fits, the sixth does not,
 * and the refusal names both numbers. A store that accepts the sixth and crashes halfway
 * through has not refused anything: it has corrupted a file.
 */

import { MemoryStorage, QuotaExceeded } from "./storage.ts";
import { renderInventory } from "./report.ts";

const BUDGET = 1 * 1e6;
const CHUNK = 200 * 1e3;

export async function main(): Promise<number> {
  const store = new MemoryStorage(BUDGET);
  const blob = new Uint8Array(CHUNK).fill(1);

  console.log(`budget           ${BUDGET.toLocaleString("en-US")} bytes`);
  console.log(`each write       ${CHUNK.toLocaleString("en-US")} bytes`);
  console.log("");

  for (let index = 1; index <= 6; index += 1) {
    try {
      await store.write(`chunk-${index}.bin`, blob);
      console.log(`  chunk-${index}       accepted`);
    } catch (error) {
      if (!(error instanceof QuotaExceeded)) throw error;
      console.log(`  chunk-${index}       REFUSED`);
      console.log(`                  ${error.neededBytes} bytes needed, ${error.budgetBytes} available`);
      console.log(`                  the store still holds what it held before this write`);
    }
  }

  console.log("");
  console.log(renderInventory(await store.list()));
  console.log("");
  console.log("five files, one refusal, and nothing half written");

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
