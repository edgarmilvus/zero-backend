/**
 * Example 1 - the port, with the simplest implementation behind it.
 *
 *   node chapters/chapter03/files/01_memory_port.ts
 *
 * Five files in, an inventory out, one file deleted, and the same script run against a second
 * store to prove the two agree. The second store is the one chapter 3 will replace with OPFS.
 */

import { MemoryStorage, totalBytes } from "./storage.ts";
import { assertPortParity, renderInventory } from "./report.ts";

const encoder = new TextEncoder();

export async function main(): Promise<number> {
  const store = new MemoryStorage(1e6);
  const payloads = ["alpha", "beta", "gamma", "delta", "epsilon"];

  for (const [index, word] of payloads.entries()) {
    await store.write(`${String(index + 1).padStart(2, "0")}-${word}.txt`, encoder.encode(word));
  }

  const before = await store.list();
  console.log(renderInventory(before));
  console.log("");
  console.log(`total            ${totalBytes(before)} bytes`);

  const one = await store.read("03-gamma.txt");
  console.log(`read back        ${new TextDecoder().decode(one)}`);

  await store.remove("02-beta.txt");
  const after = await store.list();
  console.log(`after remove     ${after.length} files`);

  const twin = new MemoryStorage(1e6);
  for (const [index, word] of payloads.entries()) {
    if (index === 1) continue;
    await twin.write(
      `${String(index + 1).padStart(2, "0")}-${word}.txt`,
      encoder.encode(word),
    );
  }
  assertPortParity(after, await twin.list());
  console.log("parity           the two stores agree on name, size and kind");

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
