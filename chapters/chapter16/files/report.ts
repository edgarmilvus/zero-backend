/**
 * What the chapter prints, and the two assertions an app test needs.
 */

import { BUDGET_BYTES, FLOPPY_BYTES } from "./budget.ts";
import type { Doc } from "./model.ts";

export function renderBudget(total: number, parts: readonly { name: string; bytes: number }[]): string {
  return [
    ...parts.map((part) => `  ${part.name.padEnd(12)} ${String(part.bytes).padStart(7)} bytes`),
    `  ${"total".padEnd(12)} ${String(total).padStart(7)} bytes (${((total / BUDGET_BYTES) * 100).toFixed(0)} per cent of the budget)`,
    `  ${"floppy".padEnd(12)} ${FLOPPY_BYTES} bytes, ${(FLOPPY_BYTES / total).toFixed(0)} copies would fit`,
  ].join("\n");
}

export function renderDoc(doc: Doc): string {
  return `${doc.notes.length} note(s), ${doc.notes.filter((note) => note.deleted).length} tombstone(s)`;
}

export function assertFits(bytes: number, budget = BUDGET_BYTES): void {
  if (bytes > budget) throw new Error(`the bundle is ${bytes} bytes against a budget of ${budget}`);
}

export function assertMerged(added: number, expected: number): void {
  if (added !== expected) throw new Error(`the merge added ${added} notes, expected ${expected}`);
}
