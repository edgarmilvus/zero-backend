/**
 * The node half of the check: the digest, then chapter 14's capability, then the clock.
 *
 * Order matters for the same reason it did in the previous chapter, and the archive adds one: the
 * digest is over content the reader has not looked at yet, so it is checked before rendering and not
 * after.
 */

import { digestOf, type Archive } from "./archive.ts";
import { verify } from "../../chapter14/files/verify.ts";

export type Verdict =
  | { readonly ok: true; readonly notes: number }
  | { readonly ok: false; readonly reason: string };

export type Check = {
  readonly now?: number;
  readonly required?: readonly string[];
};

export async function verifyArchive(archive: Archive, check: Check = {}): Promise<Verdict> {
  const digest = await digestOf(archive.notes);
  if (digest !== archive.digest) {
    return { ok: false, reason: "the notes were changed after the file was sealed" };
  }

  const capability = await verify(archive.capability, {
    ...(check.now === undefined ? {} : { now: check.now }),
    required: check.required ?? ["read:own"],
  });
  if (!capability.ok) return { ok: false, reason: capability.reason };

  return { ok: true, notes: archive.notes.length };
}

/** A file sealed an hour ago and opened tomorrow is a file a reader must refuse. */
export function assertFresh(archive: Archive, now: number): void {
  if (!Number.isFinite(archive.createdAt) || archive.createdAt > now) {
    throw new Error(`archive.createdAt: ${archive.createdAt} is not in the past`);
  }
}
