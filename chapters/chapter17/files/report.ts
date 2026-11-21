/**
 * The report: five whitelisted fields, a checksum over them, and no document.
 *
 * `buildReport` takes the diagnostics and an error, and returns a value whose shape is fixed. There is
 * deliberately no parameter for the document: the only way to leak a note is to pass one, and the
 * signature does not allow it.
 */

import { canonical } from "../../chapter14/files/capability.ts";
import type { Diagnostics } from "./diagnostics.ts";
import { type Secret, redact } from "./redact.ts";

export type SupportReport = {
  readonly v: 1;
  readonly build: string;
  readonly env: Diagnostics;
  readonly counts: { readonly notes: number; readonly tombstones: number };
  readonly error: { readonly message: string; readonly at: number } | null;
  readonly checksum: string;
};

export type Input = {
  readonly diagnostics: Diagnostics;
  readonly notes: number;
  readonly tombstones: number;
  readonly error?: { readonly message: string; readonly at: number };
  readonly secrets: readonly Secret[];
};

export async function buildReport(input: Input): Promise<SupportReport> {
  if (!Number.isInteger(input.notes) || input.notes < 0) throw new Error(`report.notes: ${input.notes} is not a count`);
  if (!Number.isInteger(input.tombstones) || input.tombstones < 0) throw new Error(`report.tombstones: ${input.tombstones} is not a count`);

  const body = {
    v: 1 as const,
    build: input.diagnostics.build,
    env: input.diagnostics,
    counts: { notes: input.notes, tombstones: input.tombstones },
    error: input.error ? { message: redact(input.error.message, input.secrets), at: input.error.at } : null,
  };

  return { ...body, checksum: await checksumOf(body) };
}

/** The checksum is over the report without itself, so a recipient can recompute it. */
export async function checksumOf(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function encodeReport(report: SupportReport): string {
  return canonical({
    v: report.v,
    build: report.build,
    env: report.env,
    counts: report.counts,
    error: report.error,
    checksum: report.checksum,
  });
}

/** A recipient's check: the checksum covers the rest, and the shape is the five fields. */
export async function checkReport(raw: unknown): Promise<{ ok: boolean; reason?: string }> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "report: not an object" };
  const report = raw as Record<string, unknown>;
  const expected = ["build", "checksum", "counts", "env", "error", "v"];
  const keys = Object.keys(report).sort();
  if (keys.join(",") !== expected.join(",")) return { ok: false, reason: `report: keys ${keys.join(",")}` };
  if (report.v !== 1) return { ok: false, reason: "report: unknown version" };

  const { checksum, ...body } = report;
  const recomputed = await checksumOf(body);
  if (recomputed !== checksum) return { ok: false, reason: "report: the checksum does not match the content" };
  return { ok: true };
}
