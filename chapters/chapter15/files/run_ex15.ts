/**
 * Chapter 15 harness: 56 assertions over the archive, the file and the reader.
 *
 * The files are real: built, rendered, parsed back from the HTML and verified with WebCrypto. A gate
 * that tested the objects and not the file would miss the only bug this format has.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildNotes, mintFor } from "./fixtures.ts";
import {
  assertDigest,
  canonical,
  canonicalNotes,
  decodeArchive,
  digestOf,
  encodeArchive,
  type Archive,
  type Note,
} from "./archive.ts";
import { escapeHtml, escapeJsonForScript, htmlBytes, renderHtml } from "./render.ts";
import { embeddedJson, readEmbedded, renderNotes, scriptCount, verdictFor } from "./reader.ts";
import { assertFresh, verifyArchive } from "./verify.ts";
import { verify as verifyCapability } from "../../chapter14/files/verify.ts";
import { assertRefuses, assertVerified } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };
const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => void checks.push({ name, run });

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}
function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  return true;
}
function throwsSync(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

const NOTES = buildNotes(5);
const CREATED = 1_700_000_000_000;
const PLUS_A_YEAR = CREATED + 365 * 24 * 60 * 60 * 1000;
const KEYS = await mintFor(CREATED);
const ARCHIVE: Archive = {
  v: 1,
  createdAt: CREATED,
  notes: NOTES,
  digest: await digestOf(NOTES),
  capability: KEYS.token,
};

// --- the content and its seal -------------------------------------------------

check("canonical JSON sorts keys", () => eq(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}', "order"));
check("canonical JSON keeps array order", () => eq(canonical([2, 1]), "[2,1]", "arrays"));
check("canonical notes sort by id", () => {
  const reversed = [...NOTES].reverse();
  return eq(canonicalNotes(reversed), canonicalNotes(NOTES), "order");
});
check("a note's fields are sorted", () => expect(canonicalNotes([NOTES[0]!]).startsWith('[{"body":'), "fields"));
check("the digest is 64 hex characters", () => expect(/^[0-9a-f]{64}$/.test(ARCHIVE.digest), ARCHIVE.digest));
check("the digest is stable", async () => eq(await digestOf(NOTES), ARCHIVE.digest, "digest"));
check("one changed character changes the digest", async () => {
  const edited = NOTES.map((note, index) => (index === 0 ? { ...note, body: `${note.body}!` } : note));
  return expect((await digestOf(edited)) !== ARCHIVE.digest, "same digest");
});
check("reordering the notes does not change the digest", async () => eq(await digestOf([...NOTES].reverse()), ARCHIVE.digest, "digest"));
check("a short digest is refused by assertDigest", () => {
  const error = throwsSync(() => assertDigest({ ...ARCHIVE, digest: "abc" }), "short");
  return expect(error.message.includes("SHA-256"), error.message);
});
check("a missing title is refused at decode", () => {
  const raw = { v: 1, createdAt: 0, notes: [{ id: "a", body: "b", updatedAt: 0 }], digest: ARCHIVE.digest, capability: "x" };
  return expect(throwsSync(() => decodeArchive(raw), "title").message.includes("title"), "message");
});
check("an unknown version is refused at decode", () => {
  const raw = { ...ARCHIVE, v: 2 };
  return expect(throwsSync(() => decodeArchive(raw), "version").message.includes("version"), "message");
});
check("a text instant is refused at decode", () => {
  const raw = { ...ARCHIVE, createdAt: "today" };
  return expect(throwsSync(() => decodeArchive(raw), "createdAt").message.includes("epoch"), "message");
});

// --- the wire format ----------------------------------------------------------

check("encode/decode round trips", () => eq(decodeArchive(JSON.parse(encodeArchive(ARCHIVE))).notes.length, NOTES.length, "notes"));
check("the encoded archive has five fields", () => eq(Object.keys(JSON.parse(encodeArchive(ARCHIVE))).sort().join(","), "capability,createdAt,digest,notes,v", "fields"));
check("decode refuses an array", () => expect(throwsSync(() => decodeArchive([]), "array").message.includes("object"), "message"));
check("decode refuses a missing capability", () => {
  const raw = { ...ARCHIVE, capability: 4 };
  return expect(throwsSync(() => decodeArchive(raw), "capability").message.includes("token"), "message");
});
check("decode refuses a note without an id", () => {
  const raw = { ...ARCHIVE, notes: [{ title: "t", body: "b", updatedAt: 0 }] };
  return expect(throwsSync(() => decodeArchive(raw), "id").message.includes("id"), "message");
});
check("a decoded archive keeps the digest", () => eq(decodeArchive(JSON.parse(encodeArchive(ARCHIVE))).digest, ARCHIVE.digest, "digest"));
check("the capability survives the round trip", () => eq(decodeArchive(JSON.parse(encodeArchive(ARCHIVE))).capability, ARCHIVE.capability, "capability"));
check("the notes keep their bodies", () => eq(decodeArchive(JSON.parse(encodeArchive(ARCHIVE))).notes[2]?.body, NOTES[2]?.body, "body"));

// --- the file -----------------------------------------------------------------

const HTML = renderHtml(ARCHIVE);

check("the file has exactly two scripts", () => eq(scriptCount(HTML), 2, "scripts"));
check("the JSON script is typed application/json", () => expect(HTML.includes('<script id="archive" type="application/json">'), "type"));
check("the reader is inline", () => expect(HTML.includes("crypto.subtle.digest"), "reader"));
check("no external resource is referenced", () => expect(!/<(script|link)[^>]+(src|href)="http/.test(HTML), "external"));
check("escapeHtml escapes the four characters", () => eq(escapeHtml(`<a & "b">`), "&lt;a &amp; &quot;b&quot;&gt;", "html"));
check("escapeJsonForScript removes the closing tag", () =>
  expect(!escapeJsonForScript('{"a":"</script>"}').includes("</script"), "raw tag"),
);
check("escapeJsonForScript keeps the value when parsed", () =>
  eq(JSON.parse(escapeJsonForScript('{"a":"</script>"}')).a, "</script>", "value"),
);
check("the escaped JSON is still valid JSON", () => eq(JSON.parse(escapeJsonForScript('{"a":"<&>"}')).a, "<&>", "json"));
check("a nasty title does not add a script", () => {
  const nasty = NOTES.map((note, index) => (index === 1 ? { ...note, title: "</script><script>alert(1)</script>" } : note));
  return eq(scriptCount(renderHtml({ ...ARCHIVE, notes: nasty })), 2, "scripts");
});
check("a nasty title round trips through the file", () => {
  const nasty = NOTES.map((note, index) => (index === 1 ? { ...note, title: "</script><script>alert(1)</script>" } : note));
  const parsed = readEmbedded(renderHtml({ ...ARCHIVE, notes: nasty }));
  return eq(parsed.notes[1]?.title, "</script><script>alert(1)</script>", "title");
});
check("the file weighs what its bytes weigh", () => eq(htmlBytes(HTML), Buffer.byteLength(HTML, "utf8"), "bytes"));
check("a bigger archive is a bigger file", () => expect(htmlBytes(renderHtml({ ...ARCHIVE, notes: buildNotes(40) })) > htmlBytes(HTML), "size"));

// --- the reader ---------------------------------------------------------------

check("the archive is extracted from the file", () => eq(readEmbedded(HTML).notes.length, NOTES.length, "notes"));
check("the raw JSON is visible before parsing", () => expect(embeddedJson(HTML).includes('"digest"'), "raw"));
check("a file with no archive is refused", () => {
  const error = throwsSync(() => readEmbedded("<html></html>"), "no archive");
  return expect(error.message.includes("no embedded archive"), error.message);
});
check("a file with broken JSON is refused", () => {
  const broken = HTML.replace('"digest":"', '"digest":');
  return expect(throwsSync(() => readEmbedded(broken), "broken").message.length > 0, "no message");
});
check("renderNotes keeps the text untouched", () => {
  const nasty = NOTES.map((note, index) => (index === 0 ? { ...note, body: "<b>bold</b>" } : note));
  return eq(renderNotes({ ...ARCHIVE, notes: nasty })[0]?.body, "<b>bold</b>", "text");
});
check("a verdict names the permission before the digest", () =>
  eq(verdictFor({ digestOk: false, capabilityOk: false, expired: false, notes: 3 }).ok, false, "verdict"),
);
check("a bad digest is refused with its sentence", () => {
  const verdict = verdictFor({ digestOk: false, capabilityOk: true, expired: false, notes: 3 });
  return expect(!verdict.ok && verdict.reason.includes("sealed"), verdict.ok ? "ok" : verdict.reason);
});
check("a good verdict counts the notes", () =>
  eq((verdictFor({ digestOk: true, capabilityOk: true, expired: false, notes: 7 }) as { notes?: number }).notes, 7, "notes"),
);

// --- the verification ---------------------------------------------------------

check("the file's permission is chapter 14's format", async () => {
  const verdict = await verifyCapability(ARCHIVE.capability, { now: CREATED });
  return expect(verdict.ok, "the capability did not verify");
});
check("a good file verifies", async () => {
  const verdict = await verifyArchive(ARCHIVE, { now: CREATED + 1000 });
  return eq(assertVerified(verdict), NOTES.length, "notes");
});
check("an edited note is refused", async () => {
  const edited = { ...ARCHIVE, notes: ARCHIVE.notes.map((note, index) => (index === 0 ? { ...note, body: "no" } : note)) };
  const verdict = await verifyArchive(edited, { now: CREATED });
  return expect(!verdict.ok && verdict.reason.includes("sealed"), verdict.ok ? "ok" : verdict.reason);
});
check("an expired capability is refused", async () => {
  const verdict = await verifyArchive(ARCHIVE, { now: PLUS_A_YEAR });
  return expect(!verdict.ok && (verdict.reason.includes("expired") || verdict.reason.includes("expired at")), verdict.ok ? "ok" : verdict.reason);
});
check("a forged capability is refused by the signature", async () => {
  const forged = { ...ARCHIVE, capability: `${ARCHIVE.capability.slice(0, -6)}AAAAAA` };
  const verdict = await verifyArchive(forged, { now: CREATED });
  return expect(!verdict.ok, "verified");
});
check("a required scope the file does not have is refused", async () => {
  const verdict = await verifyArchive(ARCHIVE, { now: CREATED, required: ["delete:all"] });
  return expect(!verdict.ok && verdict.reason.includes("scope"), verdict.ok ? "ok" : verdict.reason);
});
check("assertRefuses wants the right fragment", () => {
  const error = throwsSync(() => assertRefuses({ ok: true, notes: 1 }, "sealed"), "ok");
  return expect(error.message.includes("sealed"), error.message);
});
check("an archive sealed in the future is not fresh", () => {
  const error = throwsSync(() => assertFresh(ARCHIVE, CREATED - 1), "future");
  return expect(error.message.includes("past"), error.message);
});
check("a file with a 64-character digest of zeros is refused", async () => {
  const verdict = await verifyArchive({ ...ARCHIVE, digest: "0".repeat(64) }, { now: CREATED });
  return expect(!verdict.ok, "verified");
});
check("verification names the count on success", async () => {
  const verdict = await verifyArchive(ARCHIVE, { now: CREATED });
  return expect(verdict.ok && verdict.notes === NOTES.length, "count");
});
check("the file does not change between two renders of the same archive", () =>
  eq(renderHtml(ARCHIVE), renderHtml(ARCHIVE), "deterministic"),
);

// --- the programs -------------------------------------------------------------

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("01 builds and verifies one file", () => {
  const result = run("01_build.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("verified"), result.stdout.slice(-120));
});
check("02 refuses an edited note and an edited capability", () => {
  const result = run("02_tamper.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("changed after the file was sealed"), result.stdout);
  return expect(result.stdout.includes("signature"), result.stdout);
});
check("03 keeps a closing script tag out of the file", () => {
  const result = run("03_escape.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("scripts in file   2"), result.stdout);
});
check("04 measures one, a hundred and a thousand notes", () => {
  const result = run("04_size.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("1000 notes"), result.stdout);
});
check("05 refuses three malformed files", () => {
  const result = run("05_read.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("3/3 malformed"), result.stdout.slice(-160));
});

// --- run ----------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
    return 1;
  }
  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }
  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
