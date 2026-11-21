/**
 * What the chapter prints, and the assertions a file test needs.
 */

import { type Archive } from "./archive.ts";
import type { Verdict } from "./verify.ts";

export function renderArchive(archive: Archive, bytes: number): string {
  return [
    `notes             ${archive.notes.length}`,
    `file              ${(bytes / 1024).toFixed(1)} kB`,
    `digest            ${archive.digest.slice(0, 16)}...`,
    `capability        ${archive.capability.length} characters`,
    `sealed            ${new Date(archive.createdAt).toISOString()}`,
  ].join("\n");
}

export function renderVerdict(verdict: Verdict): string {
  return verdict.ok ? `verified          ${verdict.notes} note(s)` : `refused           ${verdict.reason}`;
}

export function assertVerified(verdict: Verdict): number {
  if (!verdict.ok) throw new Error(`expected a verified file: ${verdict.reason}`);
  return verdict.notes;
}

export function assertRefuses(verdict: Verdict, fragment: string): void {
  if (verdict.ok) throw new Error(`expected a refusal containing "${fragment}", and the file verified`);
  if (!verdict.reason.includes(fragment)) {
    throw new Error(`expected a refusal containing "${fragment}", got "${verdict.reason}"`);
  }
}
