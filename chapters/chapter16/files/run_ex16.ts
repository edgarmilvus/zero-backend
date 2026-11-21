/**
 * Chapter 16 harness: 56 assertions over the model, the store, the budget and the bundle.
 *
 * The bundle check is the one that matters: a concatenation that leaves an import is a file that dies
 * at the first line in a browser, and the size check would still pass.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { addNote, deleteNote, editNote, emptyDoc, live, mergeDocs, search } from "./model.ts";
import { decodeDoc, encodeDoc, migrate, storageKey } from "./store.ts";
import { BUDGET_BYTES, FLOPPY_BYTES, bytesOf, fits, share, total } from "./budget.ts";
import { MODULES, buildApp, bundleHtml, stripModule } from "./bundle.ts";
import { assertFits, assertMerged, renderBudget, renderDoc } from "./report.ts";

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

// --- the model ----------------------------------------------------------------

const doc = addNote(addNote(emptyDoc(), "Groceries", "milk, eggs", 1_000), "Second", "bread", 2_000);

check("an empty document has no notes", () => eq(emptyDoc().notes.length, 0, "notes"));
check("a note is added with a title and a time", () => eq(doc.notes.length, 2, "notes"));
check("a note without a title is refused", () => {
  const error = throwsSync(() => addNote(emptyDoc(), "   ", "body"), "title");
  return expect(error.message.includes("title"), error.message);
});
check("an edit changes the body and the time", () => {
  const edited = editNote(doc, doc.notes[0]!.id, "Groceries", "milk only", 3_000);
  eq(edited.notes[0]?.body, "milk only", "body");
  return eq(edited.notes[0]?.updatedAt, 3_000, "time");
});
check("editing a missing note is refused", () => {
  const error = throwsSync(() => editNote(doc, "nope", "t", "b"), "missing");
  return expect(error.message.includes("not in this document"), error.message);
});
check("a delete is a tombstone", () => {
  const dead = deleteNote(doc, doc.notes[0]!.id, 3_000);
  return expect(dead.notes.some((note) => note.deleted === true), "no tombstone");
});
check("a tombstone is not live", () => {
  const dead = deleteNote(doc, doc.notes[0]!.id, 3_000);
  return eq(live(dead).length, 1, "live");
});
check("live is sorted newest first", () => eq(live(doc)[0]?.title, "Second", "order"));
check("search finds a body word", () => eq(search(doc, "bread").length, 1, "hits"));
check("search is case-insensitive", () => eq(search(doc, "MILK").length, 1, "hits"));
check("an empty search returns everything live", () => eq(search(doc, "  ").length, 2, "hits"));
check("a merge adds what is missing", () => {
  const other = addNote(emptyDoc(), "Third", "x", 5_000);
  return eq(mergeDocs(doc, other).added, 1, "added");
});
check("a newer note wins", () => {
  const newer = { v: 2 as const, notes: [{ ...doc.notes[0]!, body: "new", updatedAt: 9_000 }] };
  return eq(mergeDocs(doc, newer).doc.notes.find((note) => note.id === doc.notes[0]!.id)?.body, "new", "body");
});
check("an older note loses and is counted", () => {
  const older = { v: 2 as const, notes: [{ ...doc.notes[0]!, body: "old", updatedAt: 1 }] };
  const merged = mergeDocs(doc, older);
  return eq(merged.conflicts, 1, "conflicts");
});
check("a merge is idempotent", () => {
  const once = mergeDocs(doc, doc).doc;
  return eq(mergeDocs(once, doc).added, 0, "added");
});

// --- the store ----------------------------------------------------------------

check("a document round trips", () => eq(decodeDoc(encodeDoc(doc)).notes.length, 2, "notes"));
check("the storage key is stable", () => eq(storageKey(), storageKey(), "stable"));
check("a null store is an empty document", () => eq(decodeDoc(null).notes.length, 0, "notes"));
check("an empty string is an empty document", () => eq(decodeDoc("").notes.length, 0, "notes"));
check("a v1 note becomes v2 with a title", () => {
  const upgraded = decodeDoc(JSON.stringify({ v: 1, notes: [{ id: "a", text: "an old note" }] }));
  eq(upgraded.v, 2, "version");
  return eq(upgraded.notes[0]?.title, "an old note", "title");
});
check("a v3 file is refused", () => {
  const error = throwsSync(() => decodeDoc(JSON.stringify({ v: 3, notes: [] })), "future");
  return expect(error.message.includes("newer"), error.message);
});
check("broken JSON is refused", () => {
  const error = throwsSync(() => decodeDoc("{"), "json");
  return expect(error.message.includes("corrupt"), error.message);
});
check("a document without notes is refused", () => {
  const error = throwsSync(() => migrate({ v: 2 }), "notes");
  return expect(error.message.includes("expected an array"), error.message);
});
check("a note without an id is refused", () => {
  const error = throwsSync(() => migrate({ v: 2, notes: [{ title: "t" }] }), "id");
  return expect(error.message.includes("missing id"), error.message);
});
check("a tombstone survives the round trip", () => {
  const dead = deleteNote(doc, doc.notes[0]!.id, 3_000);
  return expect(decodeDoc(encodeDoc(dead)).notes.some((note) => note.deleted === true), "lost");
});
check("a v1 note without text is refused", () => {
  const error = throwsSync(() => migrate({ v: 1, notes: [{ id: "a" }] }), "no text");
  return expect(error.message.includes("no text"), error.message);
});

// --- the budget ---------------------------------------------------------------

check("a file under the budget fits", () => eq(fits(50_000), true, "fits"));
check("a file over it does not", () => eq(fits(BUDGET_BYTES + 1), false, "fits"));
check("the exact budget fits", () => eq(fits(BUDGET_BYTES), true, "edge"));
check("the share is a fraction", () => eq(share(BUDGET_BYTES), 1, "share"));
check("the total sums the parts", () => eq(total([{ name: "a", bytes: 10 }, { name: "b", bytes: 5 }]), 15, "total"));
check("a negative size is refused", () => {
  const error = throwsSync(() => fits(-1), "negative");
  return expect(error.message.includes("not a size"), error.message);
});
check("a zero budget is refused", () => {
  const error = throwsSync(() => fits(1, 0), "zero");
  return expect(error.message.includes("not a budget"), error.message);
});
check("the floppy is 1.44 MB", () => eq(FLOPPY_BYTES, 1_474_560, "floppy"));
check("bytesOf counts UTF-8", () => eq(bytesOf("é"), 2, "bytes"));

// --- the bundle ---------------------------------------------------------------

const stripped = stripModule(
  'import { a } from "./a.ts";\nimport { type B } from "./b.ts";\nexport function f(x: number): number { return a + x; }\n',
  "fixture",
);

check("the strip removes every import", () => expect(!/^\s*import\s/m.test(stripped), stripped));
check("the strip removes the export keyword", () => expect(stripped.startsWith("function f("), stripped));
check("the strip keeps the code", () => expect(stripped.includes("return a + x"), stripped));
check("a surviving import is an error", () => {
  const error = throwsSync(() => stripModule('import "side-effect";\nconst x = 1;', "bad"), "import");
  return expect(error.message.includes("survived"), error.message);
});
check("the module order is model, store, app", () => eq(MODULES.join(","), "model.ts,store.ts,app.ts", "order"));
check("the bundle has one unescaped closing script tag", () => {
  const build = buildApp();
  return eq((build.html.match(/<\/script/g) ?? []).length, 1, "closing tags");
});
check("the bundle has no import statement", () => {
  const build = buildApp();
  return expect(!/^\s*import\s/m.test(build.html), "import in html");
});
check("the bundle references nothing external", () => {
  const build = buildApp();
  return expect(!/<(script|link)[^>]+(src|href)="http/.test(build.html), "external");
});
check("the bundle calls main()", () => expect(buildApp().html.includes("main();"), "no entry"));
check("the bundle fits the budget", () => expect(buildApp().fits, "over budget"));
check("the parts sum to less than the file", () => {
  const build = buildApp();
  const sum = build.parts.reduce((value, part) => value + part.bytes, 0);
  return expect(sum < build.bytes, `${sum} against ${build.bytes}`);
});
check("the file declares a viewport", () => expect(buildApp().html.includes('name="viewport"'), "no viewport"));

// --- the report and the programs ----------------------------------------------

check("the budget rendering states the per cent", () => {
  const text = renderBudget(14_000, [{ name: "model.ts", bytes: 3_000 }]);
  return expect(text.includes("per cent of the budget"), text);
});
check("the document rendering counts the tombstones", () => {
  const dead = deleteNote(doc, doc.notes[0]!.id, 3_000);
  return expect(renderDoc(dead).includes("1 tombstone"), renderDoc(dead));
});
check("assertFits throws over the line", () => {
  const error = throwsSync(() => assertFits(BUDGET_BYTES + 1), "over");
  return expect(error.message.includes("budget"), error.message);
});
check("assertMerged compares the count", () => {
  const error = throwsSync(() => assertMerged(1, 2), "mismatch");
  return expect(error.message.includes("expected 2"), error.message);
});

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("01 adds, deletes, searches and merges", () => {
  const result = run("01_model.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("the tombstone travelled"), result.stdout.slice(-120));
});
check("02 migrates v1 and refuses v3", () => {
  const result = run("02_store.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("3 documents refused"), result.stdout.slice(-120));
});
check("03 builds a file with no imports", () => {
  const result = run("03_bundle.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("no imports        true"), result.stdout);
  return expect(result.stdout.includes("written"), result.stdout);
});
check("04 prices the engines against the floppy", () => {
  const result = run("04_budget.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("floppies"), result.stdout);
});
check("05 imports twice without duplicating", () => {
  const result = run("05_import.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("second import     0 added"), result.stdout);
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
