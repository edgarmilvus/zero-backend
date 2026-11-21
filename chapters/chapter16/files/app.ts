/**
 * The app: one page, four capabilities, no server.
 *
 * Notes, search, a share link and an export. Everything the page needs is in the bundle; the share
 * link mints a capability the way chapter 14 does, and the export writes chapter 15's file in its
 * smallest form.
 */

import { addNote, deleteNote, editNote, live, mergeDocs, search, type Doc } from "./model.ts";
import { decodeDoc, encodeDoc, storageKey } from "./store.ts";

const state: { doc: Doc; term: string } = {
  doc: decodeDoc(typeof localStorage === "undefined" ? null : localStorage.getItem(storageKey())),
  term: "",
};

const save = (): void => {
  try {
    localStorage.setItem(storageKey(), encodeDoc(state.doc));
  } catch {
    /* a full quota is a page that still works for this visit */
  }
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const bytes = (text: string): number => new TextEncoder().encode(text).byteLength;

function render(): void {
  const list = document.querySelector<HTMLUListElement>("#notes");
  const count = document.querySelector<HTMLParagraphElement>("#count");
  if (!list || !count) return;

  const rows = search(state.doc, state.term);
  list.innerHTML = rows
    .map(
      (note) =>
        `<li data-id="${note.id}"><strong>${esc(note.title)}</strong><button data-del="${note.id}" title="delete this note">x</button><p>${esc(note.body)}</p></li>`,
    )
    .join("");
  count.textContent = `${rows.length} of ${live(state.doc).length} note(s), ${(bytes(encodeDoc(state.doc)) / 1024).toFixed(1)} kB stored`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const b64 = (data: Uint8Array): string => {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const unb64 = (text: string): Uint8Array<ArrayBuffer> => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
};

/** Chapter 14's capability, compacted: a signed claim about reading until an hour from now. */
async function share(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const iss = b64(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const payload = { v: 1, iss, scope: ["read:own"], exp: Date.now() + 60 * 60 * 1000, nonce: crypto.randomUUID() };
  const text = canonical(payload);
  const signature = b64(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(text))));
  return `${b64(new TextEncoder().encode(text))}.${signature}`;
}

const EXPORT_READER = `const a=JSON.parse(document.getElementById("d").textContent);document.getElementById("c").textContent=a.notes.length+" note(s), sealed "+new Date(a.sealed).toISOString();for(const n of a.notes){const e=document.createElement("article"),h=document.createElement("h2"),p=document.createElement("p");h.textContent=n.title;p.textContent=n.body;e.append(h,p);document.body.append(e)}`;

async function exportFile(): Promise<void> {
  const json = JSON.stringify({ notes: live(state.doc), sealed: Date.now() });
  const safe = json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Exported notes</title><style>body{font:15px/1.6 ui-serif,Georgia,serif;margin:32px;background:#f7f3e8;color:#1c1a17}h2{font-size:15px;margin:18px 0 2px}p{margin:0}</style></head><body><p id="c">reading...</p><script id="d" type="application/json">${safe}<\/script><script>${EXPORT_READER}<\/script></body></html>`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  link.download = "notes.html";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importFile(file: File): Promise<void> {
  const text = await file.text();
  const match = text.match(/<script id="d" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("import: this is not an export from this app");
  const parsed = JSON.parse(match[1] as string) as { notes?: Doc["notes"] };
  if (!Array.isArray(parsed.notes)) throw new Error("import: the file has no notes");
  const merged = mergeDocs(state.doc, { v: 2, notes: parsed.notes });
  state.doc = merged.doc;
  save();
  render();
  setStatus(`imported: ${merged.added} added, ${merged.conflicts} conflict(s)`);
}

function setStatus(text: string): void {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  if (status) status.textContent = text;
}

export function bind(): void {
  const form = document.querySelector<HTMLFormElement>("#add");
  const input = document.querySelector<HTMLInputElement>("#title");
  const body = document.querySelector<HTMLTextAreaElement>("#body");
  const find = document.querySelector<HTMLInputElement>("#find");
  const list = document.querySelector<HTMLUListElement>("#notes");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!input || !body) return;
    try {
      state.doc = addNote(state.doc, input.value, body.value);
      input.value = "";
      body.value = "";
      save();
      render();
      setStatus("note added");
    } catch (error) {
      setStatus((error as Error).message);
    }
  });

  find?.addEventListener("input", () => {
    state.term = find.value;
    render();
  });

  list?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const del = target.dataset.del;
    if (!del) return;
    state.doc = deleteNote(state.doc, del);
    save();
    render();
    setStatus("note deleted");
  });

  document.querySelector("#share")?.addEventListener("click", () => {
    void (async () => {
      const token = await share();
      location.hash = `cap=${token}`;
      setStatus(`share link ready in the fragment, ${token.length} characters`);
    })();
  });

  document.querySelector("#export")?.addEventListener("click", () => {
    void (async () => {
      await exportFile();
      setStatus("exported one file");
    })();
  });

  document.querySelector<HTMLInputElement>("#import")?.addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void importFile(file).catch((error: Error) => setStatus(error.message));
  });
}

export function main(): void {
  bind();
  render();
  setStatus(`${live(state.doc).length} note(s) in this browser; nothing is sent anywhere`);
}
