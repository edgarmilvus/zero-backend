/**
 * MEMFS, as the chapter needs it: a map from a name to bytes, with a budget.
 *
 * The real thing is Emscripten's in-memory filesystem and it has directories, permissions and a
 * path parser. What a transcode uses is four operations and a total, and writing those four is
 * how a reader gets to test the job without downloading 31 MB of WebAssembly first.
 */

import { QuotaExceeded, type Entry } from "../../chapter03/files/storage.ts";

export type VfsEntry = Entry;

/**
 * The files the FFmpeg instance can see.
 *
 * The budget is separate from the one in chapter 3 on purpose: this map lives inside the wasm
 * instance, and the wasm heap is the ceiling that matters. A 200 MB input in MEMFS is 200 MB of
 * address space that the instance cannot give back until the file is deleted.
 */
export class VirtualFiles {
  private readonly files = new Map<string, Uint8Array>();
  private readonly budgetBytes: number;

  constructor(budgetBytes = 512 * 1e6) {
    this.budgetBytes = budgetBytes;
  }

  write(name: string, data: Uint8Array): void {
    assertManifestName(name);
    const used = this.usedBytes() - (this.files.get(name)?.byteLength ?? 0);
    if (used + data.byteLength > this.budgetBytes) {
      throw new QuotaExceeded(used + data.byteLength, this.budgetBytes);
    }
    this.files.set(name, data);
  }

  read(name: string): Uint8Array {
    const file = this.files.get(name);
    if (!file) throw new Error(`MEMFS: no such file "${name}"`);
    return file;
  }

  has(name: string): boolean {
    return this.files.has(name);
  }

  remove(name: string): void {
    if (!this.files.delete(name)) throw new Error(`MEMFS: no such file "${name}"`);
  }

  list(): readonly VfsEntry[] {
    return [...this.files.entries()]
      .map(([name, data]) => ({ name, bytes: data.byteLength, kind: "file" as const, modifiedMs: 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  usedBytes(): number {
    let total = 0;
    for (const data of this.files.values()) total += data.byteLength;
    return total;
  }
}

/**
 * A name FFmpeg can open without quoting surprises.
 *
 * MEMFS accepts almost anything, and the concat demuxer does not: a name with a newline in it
 * splits the manifest into two lines and the job reads half a file. The rule here is the one
 * every later chapter follows: a single path segment, no spaces, no quotes, no dot-dot.
 */
export function assertManifestName(name: string): void {
  if (name === "" || name.includes("/") || name.includes("\\")) {
    throw new Error(`name: "${name}" must be a single path segment`);
  }
  if (/\s/.test(name)) {
    throw new Error(`name: "${name}" contains whitespace, and the concat manifest cannot hold it`);
  }
  if (name.includes("'") || name.includes('"')) {
    throw new Error(`name: "${name}" contains a quote, which the manifest would misread`);
  }
  if (name.startsWith("-")) {
    throw new Error(`name: "${name}" starts with a dash, and FFmpeg would read it as a flag`);
  }
}

/**
 * The `file` lines the concat demuxer reads.
 *
 * One line per segment, in order, with a trailing newline. The demuxer is strict: the file must
 * exist, the order is the order of the lines, and a blank line is a segment that does not decode.
 */
export function manifestText(names: readonly string[]): string {
  if (names.length === 0) throw new Error("manifest: no segments, so nothing to join");
  for (const name of names) assertManifestName(name);
  return `${names.map((name) => `file ${escapeConcatPath(name)}`).join("\n")}\n`;
}

/**
 * The demuxer's quoting rule, implemented rather than avoided.
 *
 * A path with a single quote in it is written as `'` closed, escaped, and reopened, which is the
 * shell's rule applied to a text file. The chapter's own names never need it, because
 * `assertManifestName` refuses them; this function is here because a reader will meet a file the
 * user named.
 */
export function escapeConcatPath(name: string): string {
  if (!name.includes("'")) return `'${name}'`;
  return `'${name.replaceAll("'", `'\\''`)}'`;
}
