/**
 * The notes and the key, shared by the programs so they cannot disagree about the fixture.
 */

import { mint } from "../../chapter14/files/capability.ts";
import { generateKeyPair } from "../../chapter14/files/keys.ts";
import type { Note } from "./archive.ts";

const SUBJECTS = ["storage", "wasm", "interface", "database"] as const;

/** Deterministic notes: the same forty on every machine, no random seed in the record. */
export function buildNotes(count: number): Note[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `n${String(index).padStart(3, "0")}`,
    title: `Note ${index} on ${SUBJECTS[index % SUBJECTS.length]}`,
    body: `This note is about ${SUBJECTS[index % SUBJECTS.length]} and is number ${index}. `.padEnd(120, "x"),
    updatedAt: 1_700_000_000_000 + index * 60_000,
  }));
}

export async function mintFor(now?: number): Promise<{ token: string; publicKey: string }> {
  const keys = await generateKeyPair();
  const minted = await mint(keys, ["read:own"], {
    ttlMs: 60 * 60 * 1000,
    nonce: "export-01",
    ...(now === undefined ? {} : { now }),
  });
  return { token: minted.token, publicKey: minted.payload.iss };
}
