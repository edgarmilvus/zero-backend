/**
 * Example 2 - the store and its two migrations.
 *
 *   node chapters/chapter16/files/02_store.ts
 *
 * A v1 document becomes v2, a v2 round trips, and a v3 is refused: a reader that parses a future file
 * as if it were this one is a reader that silently drops fields.
 */

import { decodeDoc, encodeDoc } from "./store.ts";

export function main(): number {
  const v1 = JSON.stringify({ v: 1, notes: [{ id: "a", text: "an old note" }] });
  const upgraded = decodeDoc(v1);

  const v2 = encodeDoc(upgraded);
  const back = decodeDoc(v2);

  console.log(`v1 notes          ${upgraded.notes.length}, title "${upgraded.notes[0]?.title}"`);
  console.log(`v2 bytes          ${v2.length}`);
  console.log(`round trip        ${back.notes.length === upgraded.notes.length}`);

  let refused = 0;
  for (const raw of [JSON.stringify({ v: 3, notes: [] }), "not json", JSON.stringify({ v: 2 })]) {
    try {
      decodeDoc(raw);
      console.error(`accepted ${raw.slice(0, 24)}`);
      return 1;
    } catch (error) {
      refused += 1;
      console.log(`refused           ${(error as Error).message.slice(0, 56)}`);
    }
  }

  console.log("");
  console.log(`${refused} documents refused: a version is a contract, not a comment`);

  return upgraded.notes[0]?.title === "an old note" && refused === 3 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
