/**
 * The page: two replicas that never talk, and a button that makes them exchange everything.
 *
 * The sync is a full state exchange over a function call, which is what a state-based CRDT is: no
 * server, no log, no order. The page shows both sides before and after, and the stats of the merge.
 */

import { read } from "../notes.ts";
import { createReplica, localWrite, merge, stateBytes, type Replica } from "../sync.ts";
import { remove } from "../notes.ts";

type View = { readonly name: string; readonly notes: readonly { id: string; title: string }[]; readonly tombstones: number };

export type SyncResult = {
  readonly before: { readonly laptop: View; readonly phone: View };
  readonly after: { readonly laptop: View; readonly phone: View };
  readonly conflicts: number;
  readonly added: number;
  readonly ms: number;
  readonly bytes: number;
};

let laptop: Replica = createReplica("laptop");
let phone: Replica = createReplica("phone");

const view = (replica: Replica): View => ({
  name: replica.name,
  notes: read(replica.notes).map((note) => ({ id: note.id, title: note.title })),
  tombstones: [...replica.notes.values()].filter((entry) => entry.note === null).length,
});

const LAPTOP_NOTES = [
  { id: "a1", title: "Merging notes" },
  { id: "a2", title: "Offline first" },
  { id: "shared", title: "Groceries" },
];

const PHONE_NOTES = [
  { id: "b1", title: "A third device" },
  { id: "shared", title: "Groceries" },
];

export function editLaptop(): void {
  const note = LAPTOP_NOTES[laptop.notes.size % LAPTOP_NOTES.length] ?? LAPTOP_NOTES[0]!;
  laptop = localWrite(laptop, note.id, { title: note.title, body: "edited on the laptop" });
}

export function editPhone(): void {
  const note = PHONE_NOTES[phone.notes.size % PHONE_NOTES.length] ?? PHONE_NOTES[0]!;
  phone = localWrite(phone, note.id, { title: note.title, body: "edited on the phone" });
}

/** The conflict the design loses: both sides write the same id while apart. */
export function conflict(): void {
  laptop = localWrite(laptop, "shared", { title: "Groceries", body: "milk, eggs, bread, apples" });
  phone = localWrite(phone, "shared", { title: "Groceries", body: "milk, eggs, bread, coffee" });
}

export function deleteLaptop(id: string): void {
  if (laptop.notes.has(id)) {
    laptop = { name: laptop.name, notes: remove(laptop.notes, id, { counter: laptop.notes.size + 100, actor: "laptop" }) };
  }
}

export function sync(): SyncResult {
  const before = { laptop: view(laptop), phone: view(phone) };
  const started = performance.now();
  const forward = merge(laptop, phone);
  const backward = merge(phone, laptop);
  laptop = forward.replica;
  phone = backward.replica;
  const ms = performance.now() - started;

  return {
    before,
    after: { laptop: view(laptop), phone: view(phone) },
    conflicts: forward.stats.conflicts,
    added: forward.stats.added,
    ms,
    bytes: stateBytes(forward.replica) + stateBytes(backward.replica),
  };
}

export function reset(): void {
  laptop = createReplica("laptop");
  phone = createReplica("phone");
}

declare global {
  interface Window {
    __sync: () => SyncResult;
    __editLaptop: () => void;
    __editPhone: () => void;
    __conflict: () => void;
    __reset: () => void;
    __state: () => { laptop: View; phone: View };
    __lastSync?: SyncResult;
  }
}

const list = (view: View): string =>
  view.notes.length === 0
    ? `<li class="empty">no notes yet</li>`
    : view.notes.map((note) => `<li><span class="id">${note.id}</span> ${note.title}</li>`).join("");

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const panes = {
    laptop: document.querySelector<HTMLUListElement>("#laptop"),
    phone: document.querySelector<HTMLUListElement>("#phone"),
  };
  const counts = {
    laptop: document.querySelector<HTMLParagraphElement>("#laptop-count"),
    phone: document.querySelector<HTMLParagraphElement>("#phone-count"),
  };

  const render = (): void => {
    for (const replica of [laptop, phone]) {
      const side = view(replica);
      const pane = panes[replica.name as "laptop" | "phone"];
      const count = counts[replica.name as "laptop" | "phone"];
      if (pane) pane.innerHTML = list(side);
      if (count) count.textContent = `${side.notes.length} note(s), ${side.tombstones} tombstone(s)`;
    }
  };

  const run = (label: string, fn: () => void): void => {
    fn();
    render();
    if (status) status.textContent = label;
  };

  document.querySelector("#edit-laptop")?.addEventListener("click", () => run("the laptop wrote a note, offline", editLaptop));
  document.querySelector("#edit-phone")?.addEventListener("click", () => run("the phone wrote a note, offline", editPhone));
  document.querySelector("#conflict")?.addEventListener("click", () => run("both edited the same note; sync to see who wins", conflict));
  document.querySelector("#reset")?.addEventListener("click", () => run("both replicas emptied", reset));
  document.querySelector("#sync")?.addEventListener("click", () => {
    const result = sync();
    window.__lastSync = result;
    render();
    if (status) {
      status.textContent = `synced: ${result.added} added, ${result.conflicts} conflict(s), ${result.ms.toFixed(2)} ms, ${(result.bytes / 1024).toFixed(1)} kB`;
    }
  });

  window.__sync = sync;
  window.__editLaptop = editLaptop;
  window.__editPhone = editPhone;
  window.__conflict = conflict;
  window.__reset = reset;
  window.__state = () => ({ laptop: view(laptop), phone: view(phone) });
  render();
}
