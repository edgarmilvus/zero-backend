/**
 * The port: what the app needs from a filesystem, and nothing about where it lives.
 *
 * Three implementations follow (memory, OPFS, and a worker that holds a synchronous handle),
 * and they are interchangeable because every one of them satisfies this interface. That is
 * what lets the harness run in node against a filesystem a browser does not have, and it is
 * the chapter's whole argument in one type.
 */

export type Entry = {
  readonly name: string;
  readonly bytes: number;
  readonly kind: "file" | "dir";
  readonly modifiedMs: number;
};

export type Storage = {
  write(name: string, data: Uint8Array): Promise<void>;
  read(name: string): Promise<Uint8Array>;
  list(): Promise<readonly Entry[]>;
  remove(name: string): Promise<void>;
  stat(name: string): Promise<Entry>;
};

/** A refusal, not an error: the caller decides what the user sees. */
export class QuotaExceeded extends Error {
  readonly neededBytes: number;
  readonly budgetBytes: number;

  constructor(neededBytes: number, budgetBytes: number) {
    super(
      `quota: this store holds ${budgetBytes} bytes and the write needs ${neededBytes}`,
    );
    this.name = "QuotaExceeded";
    this.neededBytes = neededBytes;
    this.budgetBytes = budgetBytes;
  }
}

/**
 * The memory implementation.
 *
 * It exists for three reasons and all of them matter: the harness needs a filesystem in node,
 * the capstone needs a fallback on a browser without OPFS, and a reader needs something to
 * compare OPFS against. It enforces a byte budget so a refusal can be demonstrated without a
 * device that happens to be full.
 */
export class MemoryStorage implements Storage {
  private readonly files = new Map<string, { data: Uint8Array; modifiedMs: number }>();
  private readonly budgetBytes: number;
  private readonly now: () => number;

  constructor(budgetBytes = 256 * 1e6, now: () => number = () => Date.now()) {
    this.budgetBytes = budgetBytes;
    this.now = now;
  }

  async write(name: string, data: Uint8Array): Promise<void> {
    if (!name || name.includes("/")) {
      throw new Error(`name: "${name}" must be a single path segment`);
    }
    const used = this.usedBytes() - (this.files.get(name)?.data.byteLength ?? 0);
    if (used + data.byteLength > this.budgetBytes) {
      throw new QuotaExceeded(used + data.byteLength, this.budgetBytes);
    }
    this.files.set(name, { data, modifiedMs: this.now() });
  }

  async read(name: string): Promise<Uint8Array> {
    const file = this.files.get(name);
    if (!file) throw new Error(`no such file: ${name}`);
    return file.data;
  }

  async list(): Promise<readonly Entry[]> {
    return [...this.files.entries()]
      .map(([name, file]) => ({
        name,
        bytes: file.data.byteLength,
        kind: "file" as const,
        modifiedMs: file.modifiedMs,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async remove(name: string): Promise<void> {
    if (!this.files.delete(name)) throw new Error(`no such file: ${name}`);
  }

  async stat(name: string): Promise<Entry> {
    const file = this.files.get(name);
    if (!file) throw new Error(`no such file: ${name}`);
    return {
      name,
      bytes: file.data.byteLength,
      kind: "file",
      modifiedMs: file.modifiedMs,
    };
  }

  private usedBytes(): number {
    let total = 0;
    for (const file of this.files.values()) total += file.data.byteLength;
    return total;
  }
}

/** Every entry the book prints has the same four fields, whichever store produced it. */
export function assertEntryShape(entry: Entry): void {
  for (const field of ["name", "bytes", "kind", "modifiedMs"] as const) {
    if (entry[field] === undefined) throw new Error(`entry is missing ${field}`);
  }
  if (entry.kind !== "file" && entry.kind !== "dir") {
    throw new Error(`entry.kind is "${String(entry.kind)}", expected file or dir`);
  }
  if (!Number.isFinite(entry.bytes) || entry.bytes < 0) {
    throw new Error(`entry.bytes is ${entry.bytes}`);
  }
}

export function totalBytes(entries: readonly Entry[]): number {
  return entries.reduce((sum, entry) => sum + entry.bytes, 0);
}
