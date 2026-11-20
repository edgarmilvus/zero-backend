/**
 * The replica and the merge.
 *
 * `merge` is the chapter: for every id it keeps the entry with the later version, and it never looks at
 * which side it is merging into. That is what makes it commutative, and what makes the order in which
 * two devices happen to sync irrelevant to the result.
 */

import { compare, type Version } from "./version.ts";
import { emptyNotes, nextVersion, topVersion, write, type Entry, type Note, type Notes } from "./notes.ts";

export type Replica = {
  readonly name: string;
  readonly notes: Notes;
};

export type MergeStats = {
  readonly keys: number;
  /** The ids where both sides had an entry and one of them won. */
  readonly conflicts: number;
  /** The ids the incoming state brought that this replica had never seen. */
  readonly added: number;
};

export type MergeResult = {
  readonly replica: Replica;
  readonly stats: MergeStats;
};

export function createReplica(name: string): Replica {
  if (name.trim() === "") throw new Error("replica: a name is required");
  return { name, notes: emptyNotes() };
}

/** A local edit, with the next version the replica can produce. */
export function localWrite(replica: Replica, id: string, note: Note): Replica {
  return { name: replica.name, notes: write(replica.notes, id, note, nextVersion(replica.notes, replica.name)) };
}

/**
 * The merge: per id, the later version wins.
 *
 * No clock comparison of the replicas themselves, no "which side is newer", no preference for the
 * local one. Every one of those would be a rule that depends on the direction of the call, and a merge
 * that depends on the direction does not converge when three devices sync in different orders.
 */
export function merge(local: Replica, incoming: Replica): MergeResult {
  const notes = new Map<string, Entry>(local.notes);
  let conflicts = 0;
  let added = 0;

  for (const [id, entry] of incoming.notes) {
    const mine = notes.get(id);
    if (mine === undefined) {
      notes.set(id, entry);
      added += 1;
      continue;
    }
    if (compare(entry.version, mine.version) > 0) {
      notes.set(id, entry);
      conflicts += 1;
    } else if (compare(entry.version, mine.version) < 0) {
      conflicts += 1;
    }
  }

  return {
    replica: { name: local.name, notes },
    stats: { keys: notes.size, conflicts, added },
  };
}

/** The bytes a state-based sync moves: the whole document, every time. */
export function stateBytes(replica: Replica): number {
  return new TextEncoder().encode(JSON.stringify(encode(replica))).byteLength;
}

type WireEntry = { version: { counter: number; actor: string }; note: Note | null };

/** The wire format: a name, the entries, and nothing the decoder cannot check. */
export function encode(replica: Replica): { name: string; entries: Record<string, WireEntry> } {
  if (replica.name.trim() === "") throw new Error("encode: a replica without a name cannot be merged");
  const entries: Record<string, WireEntry> = {};
  for (const [id, entry] of [...replica.notes.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
    entries[id] = { version: entry.version, note: entry.note };
  }
  return { name: replica.name, entries };
}

export function decode(raw: unknown): Replica {
  if (typeof raw !== "object" || raw === null) throw new Error("sync: expected an object");
  const root = raw as { name?: unknown; entries?: unknown };
  if (typeof root.name !== "string" || root.name.trim() === "") throw new Error("sync.name: missing");
  if (typeof root.entries !== "object" || root.entries === null || Array.isArray(root.entries)) {
    throw new Error("sync.entries: expected an object");
  }

  const notes = new Map<string, Entry>();
  for (const [id, value] of Object.entries(root.entries as Record<string, unknown>)) {
    if (id.trim() === "") throw new Error("sync.entries: an empty id");
    if (typeof value !== "object" || value === null) throw new Error(`sync.entries[${id}]: expected an object`);
    const entry = value as { version?: unknown; note?: unknown };
    const at = entry.version as { counter?: unknown; actor?: unknown } | undefined;
    if (
      at === undefined ||
      typeof at.counter !== "number" ||
      !Number.isInteger(at.counter) ||
      at.counter < 1 ||
      typeof at.actor !== "string" ||
      at.actor.trim() === ""
    ) {
      throw new Error(`sync.entries[${id}].version: expected a counter and an actor`);
    }
    if (entry.note !== null) {
      const note = entry.note as { title?: unknown; body?: unknown };
      if (typeof note?.title !== "string" || typeof note?.body !== "string") {
        throw new Error(`sync.entries[${id}].note: expected a title and a body`);
      }
    }
    notes.set(id, {
      version: { counter: at.counter, actor: at.actor },
      note: entry.note === null ? null : { title: (entry.note as Note).title, body: (entry.note as Note).body },
    });
  }

  return { name: root.name, notes };
}

/** A canonical string for comparing two converged replicas in a test. */
export function fingerprint(replica: Replica): string {
  return JSON.stringify(encode(replica).entries);
}
