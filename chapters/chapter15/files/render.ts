/**
 * The file: one HTML document with the archive in a JSON script and the reader in another.
 *
 * `escapeJsonForScript` is the whole safety of the format. JSON inside `<script>` is not JSON: the
 * HTML parser looks for `</script` first, so a note containing it ends the element and the rest of the
 * note becomes markup. Replacing `<` with `\\u003c` keeps the bytes valid JSON and invisible to the
 * parser.
 */

import { canonicalNotes, type Archive } from "./archive.ts";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * JSON that can live inside a script element: `<` is escaped so `</script` cannot occur, and the two
 * line separators are escaped because they are valid JSON and illegal in a JavaScript string literal.
 */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** The reader, inline: no link, no dependency on a site that may not exist in ten years. */
export const READER = String.raw`
const esc = (s) => s;
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).filter((k) => value[k] !== undefined).sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
const hex = (buffer) => Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
const bytes = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4)), (c) => c.charCodeAt(0));

async function digestOf(notes) {
  const sorted = [...notes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(sorted))));
}

async function verifyCapability(token) {
  const [body, signature] = token.split(".");
  const payload = JSON.parse(new TextDecoder().decode(bytes(body)));
  const key = await crypto.subtle.importKey("raw", bytes(payload.iss), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, bytes(signature), new TextEncoder().encode(canonical(payload)));
  return { ok, payload };
}

(async () => {
  const status = document.getElementById("status");
  const list = document.getElementById("notes");
  const title = document.getElementById("title");
  try {
    const archive = JSON.parse(document.getElementById("archive").textContent);
    const capability = await verifyCapability(archive.capability);
    if (!capability.ok) throw new Error("the permission in this file does not verify");
    if (Date.now() >= capability.payload.exp) throw new Error("the permission in this file expired at " + new Date(capability.payload.exp).toISOString());
    const digest = await digestOf(archive.notes);
    if (digest !== archive.digest) throw new Error("the notes were changed after the file was sealed");
    title.textContent = "Notes, verified";
    status.textContent = "sealed " + new Date(archive.createdAt).toISOString() + ", " + archive.notes.length + " note(s), permission valid until " + new Date(capability.payload.exp).toISOString();
    for (const note of archive.notes) {
      const item = document.createElement("article");
      const heading = document.createElement("h2");
      heading.textContent = note.title;
      const body = document.createElement("p");
      body.textContent = note.body;
      item.append(heading, body);
      list.append(item);
    }
  } catch (error) {
    title.textContent = "Not verified";
    status.textContent = String(error && error.message ? error.message : error);
    status.className = "bad";
  }
})();
`;

export function renderHtml(archive: Archive): string {
  const json = escapeJsonForScript(JSON.stringify({
    v: archive.v,
    createdAt: archive.createdAt,
    notes: archive.notes,
    digest: archive.digest,
    capability: archive.capability,
  }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>An exported notebook</title>
<style>
  body { font: 15px/1.6 ui-serif, Georgia, serif; margin: 0; padding: 32px; background: #f7f3e8; color: #1c1a17; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  #status { font: 12px/1.5 ui-monospace, monospace; color: #6b6355; margin: 0 0 24px; }
  #status.bad { color: #a0301e; }
  article { max-width: 62ch; margin-bottom: 22px; }
  h2 { font-size: 15px; margin: 0 0 2px; }
  p { margin: 0; }
</style>
</head>
<body>
<h1 id="title">Checking the seal...</h1>
<p id="status">reading the embedded archive</p>
<div id="notes"></div>
<script id="archive" type="application/json">${json}</script>
<script>${READER}</script>
</body>
</html>
`;
}

/** The bytes a file weighs, in UTF-8, which is what a download is measured in. */
export function htmlBytes(html: string): number {
  return new TextEncoder().encode(html).byteLength;
}

export { canonicalNotes };
