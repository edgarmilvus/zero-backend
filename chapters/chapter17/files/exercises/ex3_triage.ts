/**
 * Exercise 3 - the triage that guessed.
 *
 * A triage keyed on "the user said it is broken" produces the same answer for every report. The rules
 * have to be a table, ordered, with a first action each.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Signal = { storage: boolean; crypto: boolean; notes: number; storageBytes: number; message: string };
export type Category = "no-storage" | "store-not-read" | "no-crypto" | "import" | "unknown";

export const RULES: readonly { test: (signal: Signal) => boolean; category: Category; action: string }[] = [
  { test: (s) => !s.storage, category: "no-storage", action: "check site data and private mode" },
  { test: (s) => s.notes === 0 && s.storageBytes > 0, category: "store-not-read", action: "ask for the export" },
  { test: (s) => !s.crypto, category: "no-crypto", action: "update the browser" },
  { test: (s) => s.message.includes("sealed") || s.message.includes("digest"), category: "import", action: "inspect the file's JSON" },
];

export function triage(signal: Signal): { category: Category; action: string } {
  for (const rule of RULES) {
    if (rule.test(signal)) return { category: rule.category, action: rule.action };
  }
  return { category: "unknown", action: "ask what happened just before" };
}

const BASE: Signal = { storage: true, crypto: true, notes: 3, storageBytes: 100, message: "" };

export const checks: readonly Check[] = [
  { name: "no storage is first", run: () => eq(triage({ ...BASE, storage: false, crypto: false }).category, "no-storage", "first") },
  { name: "notes zero with bytes is the store", run: () => eq(triage({ ...BASE, notes: 0, storageBytes: 10 }).category, "store-not-read", "store") },
  { name: "notes zero with no bytes is not", run: () => eq(triage({ ...BASE, notes: 0, storageBytes: 0 }).category, "unknown", "empty") },
  { name: "no crypto is third", run: () => eq(triage({ ...BASE, crypto: false }).category, "no-crypto", "crypto") },
  { name: "a sealed message is an import", run: () => eq(triage({ ...BASE, message: "changed after the file was sealed" }).category, "import", "import") },
  { name: "a digest message is an import", run: () => eq(triage({ ...BASE, message: "digest mismatch" }).category, "import", "digest") },
  { name: "anything else is unknown", run: () => eq(triage(BASE).category, "unknown", "unknown") },
  { name: "every category has an action", run: () => expect([...RULES, { action: "ask what happened just before" }].every((rule) => rule.action.length > 3), "short") },
  { name: "the order is the array's", run: () => eq(RULES.map((rule) => rule.category).join(","), "no-storage,store-not-read,no-crypto,import", "order") },
  { name: "a case-sensitive message does not match", run: () => eq(triage({ ...BASE, message: "SEALED" }).category, "unknown", "case") },
];

export function main(): number {
  for (const signal of [
    { ...BASE, storage: false },
    { ...BASE, notes: 0, storageBytes: 10 },
    { ...BASE, crypto: false },
    { ...BASE, message: "digest" },
  ]) {
    console.log(`${triage(signal).category.padEnd(14)} ${triage(signal).action}`);
  }
  console.log("");
  console.log("a triage is a table, and the table is the product decision");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
