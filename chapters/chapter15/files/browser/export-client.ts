/**
 * The page: build the file, open it in an iframe, and let the reader inside the file decide.
 *
 * `srcdoc` runs the export's own script in a sandbox with the same origin, which is the closest a
 * browser gets to double-clicking the file. The page does not render the notes; the file does.
 */

import { digestOf, type Archive, type Note } from "../archive.ts";
import { mint } from "../../../chapter14/files/capability.ts";
import { generateKeyPair } from "../../../chapter14/files/keys.ts";
import { htmlBytes, renderHtml } from "../render.ts";

export type Built = {
  readonly notes: number;
  readonly bytes: number;
  readonly digest: string;
  readonly mode: "sealed" | "tampered" | "expired";
  readonly verdict: string;
};

let last: { archive: Archive; html: string } | null = null;

function notes(): Note[] {
  return Array.from({ length: 12 }, (_unused, index) => ({
    id: `n${String(index).padStart(3, "0")}`,
    title: index === 3 ? "A note about </script> and the parser" : `Note ${index}`,
    body: `This is note ${index}, written on the device and exported as one file. `.padEnd(100, "x"),
    updatedAt: 1_700_000_000_000 + index * 60_000,
  }));
}

async function frame(): Promise<HTMLIFrameElement> {
  const element = document.querySelector<HTMLIFrameElement>("#export");
  if (!element) throw new Error("no iframe");
  return element;
}

/**
 * Replaces the frame's document and waits for the *new* document's reader.
 *
 * Blanking the srcdoc first is not decoration: without it the poll reads the previous document's
 * verdict, which is still "Notes, verified", and every later mode looks verified too.
 */
async function show(html: string): Promise<string> {
  const element = await frame();
  element.srcdoc = "<!doctype html><title>replacing</title>";
  await new Promise((resolve) => setTimeout(resolve, 40));
  element.srcdoc = html;
  return verdictOfFrame(element);
}

/** Waits for the export's own reader to finish, then reads its verdict out of the frame. */
async function verdictOfFrame(element: HTMLIFrameElement): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const title = element.contentDocument?.getElementById("title")?.textContent ?? "";
    if (title && title !== "Checking the seal...") {
      const status = element.contentDocument?.getElementById("status")?.textContent ?? "";
      return `${title}: ${status}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return "the reader never finished";
}

export async function build(mode: "sealed" | "tampered" | "expired" = "sealed"): Promise<Built> {
  const keys = await generateKeyPair();
  // An expired permission is minted in the past, not with a negative lifetime: chapter 14 refuses a
  // ttl that is not a duration, and the reader's rule is the same one.
  const now = mode === "expired" ? Date.now() - 3_600_000 : Date.now();
  const capability = await mint(keys, ["read:own"], {
    ttlMs: mode === "expired" ? 60_000 : 60 * 60_000,
    now,
    nonce: `export-${mode}`,
  });
  const base = notes();
  const shipped =
    mode === "tampered"
      ? base.map((note, index) => (index === 0 ? { ...note, body: `${note.body} edited in transit` } : note))
      : base;

  const digest = await digestOf(base);
  const archive: Archive = {
    v: 1,
    createdAt: now,
    notes: shipped,
    digest,
    capability: capability.token,
  };

  const html = renderHtml(archive);
  last = { archive, html };
  const verdict = await show(html);

  return { notes: archive.notes.length, bytes: htmlBytes(html), digest, mode, verdict };
}

/** The same file after one note was edited: the digest no longer covers the content. */
export async function tamper(): Promise<Built> {
  if (!last) return build("tampered");
  const archive: Archive = {
    ...last.archive,
    notes: last.archive.notes.map((note, index) => (index === 0 ? { ...note, body: `${note.body} edited` } : note)),
  };
  const html = renderHtml(archive);
  last = { archive, html };
  return { notes: archive.notes.length, bytes: htmlBytes(html), digest: archive.digest, mode: "tampered", verdict: await show(html) };
}

declare global {
  interface Window {
    __build: (mode?: "sealed" | "tampered" | "expired") => Promise<Built>;
    __tamper: () => Promise<Built>;
    __lastBuild?: Built;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");

  const run = async (mode: "sealed" | "tampered" | "expired"): Promise<void> => {
    if (status) status.textContent = "building the file and opening it...";
    const built = await build(mode);
    window.__lastBuild = built;
    if (status) status.textContent = built.verdict;
    if (output) {
      output.textContent = [
        `mode              ${built.mode}`,
        `notes             ${built.notes}`,
        `file              ${(built.bytes / 1024).toFixed(1)} kB`,
        `digest            ${built.digest.slice(0, 16)}...`,
        "",
        `the reader says   ${built.verdict}`,
      ].join("\n");
    }
  };

  document.querySelector("#seal")?.addEventListener("click", () => void run("sealed"));
  document.querySelector("#expire")?.addEventListener("click", () => void run("expired"));
  document.querySelector("#tamper")?.addEventListener("click", () => {
    void (async () => {
      if (status) status.textContent = "editing one note after the seal...";
      const built = await tamper();
      window.__lastBuild = built;
      if (status) status.textContent = built.verdict;
      if (output) {
        output.textContent = [
          `mode              ${built.mode}`,
          `notes             ${built.notes}`,
          `file              ${(built.bytes / 1024).toFixed(1)} kB`,
          "",
          `the reader says   ${built.verdict}`,
        ].join("\n");
      }
    })();
  });

  window.__build = build;
  window.__tamper = tamper;
}
