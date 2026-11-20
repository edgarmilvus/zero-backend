/**
 * Chapter 13 harness: 56 assertions over the merge and its three properties.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { actor, compare, highest, later, same, tick, version } from "./version.ts";
import { emptyNotes, nextVersion, read, remove, tombstone, write } from "./notes.ts";
import { createReplica, decode, encode, fingerprint, localWrite, merge, stateBytes } from "./sync.ts";
import { assertCommutative, assertConverged, renderMerge, renderReplica } from "./report.ts";

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

// --- the version --------------------------------------------------------------

check("a version keeps its counter and its actor", () => eq(version(3, "phone").counter, 3, "counter"));
check("an empty actor is refused", () => {
  const error = throwsSync(() => actor("  "), "empty");
  return expect(error.message.includes("name"), error.message);
});
check("an actor over 64 characters is refused", () => expect(throwsSync(() => actor("x".repeat(65)), "long").message.includes("64"), "no limit"));
check("a counter of zero is refused", () => {
  const error = throwsSync(() => version(0, "phone"), "zero");
  return expect(error.message.includes("positive"), error.message);
});
check("ticking a fresh replica gives one", () => eq(tick(undefined, "phone").counter, 1, "counter"));
check("ticking a version gives the next one", () => eq(tick(version(4, "phone"), "laptop").counter, 5, "counter"));
check("a higher counter is later", () => eq(compare(version(2, "a"), version(1, "z")), 1, "order"));
check("at the same counter the actor breaks the tie", () => eq(compare(version(2, "a"), version(2, "b")), -1, "tie"));
check("the order is total and stable", () => {
  const left = version(2, "a");
  const right = version(2, "b");
  return eq(compare(left, right) === -compare(right, left), true, "antisymmetry");
});
check("the later of two is the maximum", () => eq(later(version(1, "z"), version(2, "a")).counter, 2, "later"));

check("two identical versions are the same", () => expect(same(version(2, "a"), version(2, "a")), "different"));
check("highest picks the largest", () => eq(highest([version(1, "z"), version(3, "a"), version(2, "m")])?.counter, 3, "highest"));

// --- the notes ----------------------------------------------------------------

const at = (counter: number, name: string) => version(counter, name);

check("an empty document has no entries", () => eq(emptyNotes().size, 0, "size"));
check("a write adds an entry", () => eq(write(emptyNotes(), "n1", { title: "T", body: "B" }, at(1, "a")).size, 1, "size"));
check("a note without a title is refused", () => {
  const error = throwsSync(() => write(emptyNotes(), "n1", { title: " ", body: "B" }, at(1, "a")), "title");
  return expect(error.message.includes("title"), error.message);
});
check("a read returns the live notes", () => eq(read(write(emptyNotes(), "n1", { title: "T", body: "B" }, at(1, "a"))).length, 1, "rows"));
check("a read is sorted by id", () => {
  let notes = write(emptyNotes(), "b", { title: "B", body: "" }, at(1, "a"));
  notes = write(notes, "a", { title: "A", body: "" }, at(2, "a"));
  return eq(read(notes).map((row) => row.id).join(","), "a,b", "order");
});
check("a delete leaves a tombstone", () => tombstone(remove(write(emptyNotes(), "n1", { title: "T", body: "" }, at(1, "a")), "n1", at(2, "a")), "n1"));
check("a tombstone is not in the read", () =>
  eq(read(remove(write(emptyNotes(), "n1", { title: "T", body: "" }, at(1, "a")), "n1", at(2, "a"))).length, 0, "rows"),
);
check("deleting a note that is not there is refused", () =>
  expect(throwsSync(() => remove(emptyNotes(), "nope", at(1, "a")), "missing").message.includes("not in this replica"), "message"),
);
check("the next version is above everything seen", () => {
  let notes = write(emptyNotes(), "n1", { title: "T", body: "" }, at(7, "a"));
  notes = write(notes, "n2", { title: "U", body: "" }, at(3, "b"));
  return eq(nextVersion(notes, "phone").counter, 8, "counter");
});
check("a write replaces the version of an existing note", () => {
  let notes = write(emptyNotes(), "n1", { title: "old", body: "" }, at(1, "a"));
  notes = write(notes, "n1", { title: "new", body: "" }, at(2, "a"));
  return eq(read(notes)[0]?.title, "new", "title");
});

// --- the merge ----------------------------------------------------------------

function pair(): { laptop: ReturnType<typeof createReplica>; phone: ReturnType<typeof createReplica> } {
  const laptop = localWrite(createReplica("laptop"), "a1", { title: "Laptop", body: "" });
  const phone = localWrite(createReplica("phone"), "b1", { title: "Phone", body: "" });
  return { laptop, phone };
}

check("a merge takes both notes", () => {
  const { laptop, phone } = pair();
  return eq(merge(laptop, phone).stats.keys, 2, "keys");
});
check("the merge is commutative", () => {
  const { laptop, phone } = pair();
  return expect(assertCommutative(merge(laptop, phone), merge(phone, laptop)) === undefined, "threw");
});
check("the merge is idempotent", () => {
  const { laptop, phone } = pair();
  const once = merge(laptop, phone).replica;
  const twice = merge(once, phone).replica;
  return eq(fingerprint(twice), fingerprint(once), "document");
});
check("the merge is associative over three replicas", () => {
  const a = localWrite(createReplica("a"), "1", { title: "A", body: "" });
  const b = localWrite(createReplica("b"), "2", { title: "B", body: "" });
  const c = localWrite(createReplica("c"), "3", { title: "C", body: "" });
  const left = merge(merge(a, b).replica, c).replica;
  const right = merge(a, merge(b, c).replica).replica;
  return eq(fingerprint(left), fingerprint(right), "document");
});
check("the same id with a higher version wins", () => {
  const base = localWrite(createReplica("a"), "n1", { title: "old", body: "" });
  const other = { name: "b", notes: new Map([["n1", { version: at(2, "b"), note: { title: "new", body: "" } }]]) };
  const merged = merge(base, other).replica;
  return eq(read(merged.notes)[0]?.title, "new", "title");
});
check("the same id with a lower version loses", () => {
  const base = localWrite(createReplica("a"), "n1", { title: "new", body: "" });
  const other = { name: "b", notes: new Map([["n1", { version: at(1, "a"), note: { title: "old", body: "" } }]]) };
  return eq(read(merge(base, other).replica.notes)[0]?.title, "new", "title");
});
check("a conflict is counted once per side", () => {
  const base = localWrite(createReplica("a"), "n1", { title: "left", body: "" });
  const other = { name: "b", notes: new Map([["n1", { version: at(1, "b"), note: { title: "right", body: "" } }]]) };
  return eq(merge(base, other).stats.conflicts, 1, "conflicts");
});
check("a tombstone survives a merge with a live copy", () => {
  const base = localWrite(createReplica("a"), "n1", { title: "x", body: "" });
  const dead = { name: "b", notes: new Map([["n1", { version: at(2, "b"), note: null }]]) };
  const merged = merge(base, dead).replica;
  return expect(tombstone(merged.notes, "n1") && read(merged.notes).length === 0, "the note came back");
});
check("a merge into an empty replica adds everything", () => {
  const { laptop } = pair();
  return eq(merge(createReplica("phone"), laptop).stats.added, 1, "added");
});
check("three replicas converge in every order", () => {
  const a = localWrite(createReplica("a"), "1", { title: "A", body: "" });
  const b = localWrite(createReplica("b"), "2", { title: "B", body: "" });
  const c = localWrite(createReplica("c"), "3", { title: "C", body: "" });
  const orders = [
    [a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a],
  ];
  const prints = new Set(orders.map((order) => fingerprint(order.reduce((left, right) => merge(left, right).replica))));
  return eq(prints.size, 1, "orders");
});
check("a merge of a replica with itself changes nothing", () => {
  const { laptop } = pair();
  return eq(fingerprint(merge(laptop, laptop).replica), fingerprint(laptop), "document");
});
check("convergence is an assertion that fails on damage", () => {
  const { laptop } = pair();
  const damaged = { name: laptop.name, notes: emptyNotes() };
  return expect(throwsSync(() => assertConverged(laptop, damaged), "damage").message.includes("disagree"), "message");
});
check("a merge keeps the local name", () => {
  const { laptop, phone } = pair();
  return eq(merge(laptop, phone).replica.name, "laptop", "name");
});
check("an entry the incoming replica lost is kept", () => {
  const { laptop, phone } = pair();
  return eq(merge(laptop, phone).replica.notes.size, 2, "entries");
});

check("a tombstone query on a missing id is false", () => expect(!tombstone(emptyNotes(), "nope"), "tombstone"));
check("a merge reports the entries it holds", () => {
  const { laptop, phone } = pair();
  return eq(merge(laptop, phone).stats.keys, merge(laptop, phone).replica.notes.size, "keys");
});
check("a local write advances the replica's counter", () => {
  const replica = localWrite(createReplica("a"), "n1", { title: "T", body: "" });
  return eq(nextVersion(replica.notes, "a").counter, 2, "counter");
});

// --- the wire ------------------------------------------------------------------

check("encode round trips through decode", () => {
  const { laptop } = pair();
  return eq(fingerprint(decode(JSON.parse(JSON.stringify(encode(laptop))))), fingerprint(laptop), "document");
});
check("a replica without a name is not encoded", () => {
  const error = throwsSync(() => encode({ name: "  ", notes: emptyNotes() }), "name");
  return expect(error.message.includes("name"), error.message);
});
check("decode refuses an empty name", () => {
  const error = throwsSync(() => decode({ name: "", entries: {} }), "name");
  return expect(error.message.includes("name"), error.message);
});
check("decode refuses a bad counter", () => {
  const error = throwsSync(() => decode({ name: "a", entries: { n1: { version: { counter: 0, actor: "a" }, note: null } } }), "counter");
  return expect(error.message.includes("counter"), error.message);
});
check("decode refuses a note without a title", () => {
  const error = throwsSync(() => decode({ name: "a", entries: { n1: { version: { counter: 1, actor: "a" }, note: { body: "x" } } } }), "note");
  return expect(error.message.includes("title"), error.message);
});
check("decode refuses an array as entries", () => {
  const error = throwsSync(() => decode({ name: "a", entries: [] }), "array");
  return expect(error.message.includes("object"), error.message);
});
check("a state's bytes grow with its notes", () => {
  const small = localWrite(createReplica("a"), "n1", { title: "T", body: "b" });
  const big = localWrite(small, "n2", { title: "U", body: "c" });
  return expect(stateBytes(big) > stateBytes(small), "no growth");
});
check("encode sorts its entries by id", () => {
  let replica = localWrite(createReplica("a"), "b", { title: "B", body: "" });
  replica = localWrite(replica, "a", { title: "A", body: "" });
  return eq(Object.keys(encode(replica).entries).join(","), "a,b", "order");
});
check("a decoded replica merges like the original", () => {
  const { laptop, phone } = pair();
  const decoded = decode(JSON.parse(JSON.stringify(encode(phone))));
  return eq(fingerprint(merge(laptop, decoded).replica), fingerprint(merge(laptop, phone).replica), "document");
});

// --- the report and the programs ----------------------------------------------

check("the replica rendering names the notes and the tombstones", () => {
  const text = renderReplica(pair().laptop);
  return expect(text.includes("laptop") && text.includes("1 note(s)"), text);
});
check("the merge rendering names the conflicts and the added entries", () => {
  const { laptop, phone } = pair();
  const merged = merge(laptop, phone);
  const text = renderMerge("laptop + phone", merged.stats, merged.replica);
  return expect(text.includes("1 added") && text.includes("0 conflict"), text);
});
check("the report refuses a merge that changed the order", () => {
  const a = localWrite(createReplica("a"), "1", { title: "A", body: "" });
  const b = localWrite(createReplica("b"), "2", { title: "B", body: "" });
  return eq(fingerprint(merge(a, b).replica), fingerprint(merge(b, a).replica), "document");
});

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("01 merges both ways and says so", () => {
  const result = run("01_merge.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("same document in both directions"), result.stdout.slice(-120));
});
check("02 runs six orders and finds one document", () => {
  const result = run("02_permutations.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("orders            6"), result.stdout);
  return expect(result.stdout.includes("distinct results  1"), result.stdout);
});
check("03 shows the edit the merge loses", () => {
  const result = run("03_conflict.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("lost"), result.stdout.slice(-160));
});
check("04 measures a thousand notes and their tombstones", () => {
  const result = run("04_size.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("1000 added"), result.stdout);
});
check("05 refuses three malformed payloads", () => {
  const result = run("05_roundtrip.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("3 refusals"), result.stdout.slice(-120));
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
