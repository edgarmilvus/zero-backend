/**
 * The archive: the notes, the digest that binds them, and the capability that bounds them.
 *
 * The digest is what makes the notes the document. A signature over the file would cover the reader
 * too, and the reader is code the exporter wrote; a digest over the notes lets the reader be replaced
 * without invalidating the content.
 */

export type Note = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly updatedAt: number;
};

export type Archive = {
  readonly v: 1;
  readonly createdAt: number;
  readonly notes: readonly Note[];
  /** SHA-256 of the canonical notes, hex. */
  readonly digest: string;
  /** The chapter 14 token: who may read it, and until when. */
  readonly capability: string;
};

/** Deterministic JSON: keys sorted, notes sorted by id, no whitespace. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalNotes(notes: readonly Note[]): string {
  const sorted = [...notes].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return canonical(sorted);
}

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export async function digestOf(notes: readonly Note[]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalNotes(notes));
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

export function assertDigest(archive: Archive): void {
  if (!/^[0-9a-f]{64}$/.test(archive.digest)) throw new Error(`archive.digest: ${archive.digest} is not a SHA-256 hex`);
}

/** The object a reader parses first, before it can trust anything else. */
export function encodeArchive(archive: Archive): string {
  return JSON.stringify({
    v: archive.v,
    createdAt: archive.createdAt,
    notes: archive.notes,
    digest: archive.digest,
    capability: archive.capability,
  });
}

export function decodeArchive(value: unknown): Archive {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("archive: expected an object");
  const root = value as Record<string, unknown>;
  if (root.v !== 1) throw new Error(`archive.v: ${String(root.v)} is not a version this reader knows`);
  if (typeof root.createdAt !== "number" || !Number.isFinite(root.createdAt)) {
    throw new Error("archive.createdAt: expected epoch milliseconds");
  }
  if (!Array.isArray(root.notes)) throw new Error("archive.notes: expected an array");
  if (typeof root.digest !== "string") throw new Error("archive.digest: expected a hex string");
  if (typeof root.capability !== "string") throw new Error("archive.capability: expected a token");
  const notes = root.notes.map((entry, index) => {
    const note = entry as Record<string, unknown>;
    if (typeof note.id !== "string" || typeof note.title !== "string" || typeof note.body !== "string") {
      throw new Error(`archive.notes[${index}]: expected id, title and body`);
    }
    if (typeof note.updatedAt !== "number") throw new Error(`archive.notes[${index}].updatedAt: expected an instant`);
    return { id: note.id, title: note.title, body: note.body, updatedAt: note.updatedAt };
  });
  return { v: 1, createdAt: root.createdAt, notes, digest: root.digest, capability: root.capability };
}
