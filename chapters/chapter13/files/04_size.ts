/**
 * Example 4 - what a thousand notes cost to sync.
 *
 *   node chapters/chapter13/files/04_size.ts
 *
 * A state-based sync sends the whole document, tombstones included. The program measures it, because
 * the alternative — a delta log — is a protocol decision that needs a number.
 */

import { createReplica, localWrite, merge, stateBytes } from "./sync.ts";
import { remove } from "./notes.ts";

const NOTES = 1_000;

export function main(): number {
  let replica = createReplica("laptop");
  for (let index = 0; index < NOTES; index += 1) {
    replica = localWrite(replica, `n${index}`, { title: `Note ${index}`, body: "x".repeat(120) });
  }

  const withNotes = stateBytes(replica);
  for (let index = 0; index < 100; index += 1) {
    replica = { name: replica.name, notes: remove(replica.notes, `n${index}`, { counter: NOTES + index + 1, actor: "laptop" }) };
  }
  const withTombstones = stateBytes(replica);

  const other = createReplica("phone");
  const started = performance.now();
  const merged = merge(other, replica);
  const mergeMs = performance.now() - started;

  console.log(`notes             ${NOTES}`);
  console.log(`state             ${(withNotes / 1024).toFixed(0)} kB`);
  console.log(`after 100 deletes ${(withTombstones / 1024).toFixed(0)} kB, tombstones still travel`);
  console.log(`merge into empty  ${mergeMs.toFixed(1)} ms, ${merged.stats.added} added`);
  console.log("");
  console.log(`two devices sync  ${((withTombstones * 2) / 1024).toFixed(0)} kB for one exchange`);

  return merged.stats.added === NOTES ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
