/**
 * What the chapter prints, and the three properties as assertions.
 */

import { fingerprint, type Replica } from "./sync.ts";
import { read } from "./notes.ts";

export function renderReplica(replica: Replica): string {
  const rows = read(replica.notes);
  const tombstones = [...replica.notes.values()].filter((entry) => entry.note === null).length;
  return [
    `${replica.name.padEnd(6)} ${rows.length} note(s), ${tombstones} tombstone(s)`,
    ...rows.map((row) => `  ${row.id.padEnd(6)} ${row.title}`),
  ].join("\n");
}

export function renderMerge(label: string, result: { conflicts: number; added: number }, replica: Replica): string {
  return [
    `${label.padEnd(18)} ${result.added} added, ${result.conflicts} conflict(s)`,
    ...read(replica.notes).map((row) => `  ${row.id.padEnd(6)} ${row.title}`),
  ].join("\n");
}

/** Convergence: the same document, whatever order the replicas were merged in. */
export function assertConverged(left: Replica, right: Replica): void {
  if (fingerprint(left) !== fingerprint(right)) {
    throw new Error(`the replicas disagree: ${fingerprint(left).slice(0, 80)} against ${fingerprint(right).slice(0, 80)}`);
  }
}

export function assertCommutative(
  forward: { replica: Replica },
  backward: { replica: Replica },
): void {
  if (fingerprint(forward.replica) !== fingerprint(backward.replica)) {
    throw new Error("the merge is not commutative: the order of the arguments changed the document");
  }
}
