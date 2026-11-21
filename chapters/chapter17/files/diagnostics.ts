/**
 * The diagnostics: six facts about the environment, and none about the notes.
 *
 * A support report is a whitelist, so this file is the list: what the app may say about itself. Every
 * field here is a fact the product can defend sending without the user reading it first.
 */

export type Diagnostics = {
  readonly build: string;
  readonly storage: boolean;
  readonly crypto: boolean;
  readonly indexedDb: boolean;
  readonly fileProtocol: boolean;
  readonly storageBytes: number;
};

export type Probe = {
  readonly storage?: boolean;
  readonly crypto?: boolean;
  readonly indexedDb?: boolean;
  readonly fileProtocol?: boolean;
  readonly storageBytes?: number;
};

/**
 * Collects the facts from whatever is available. Each probe is a try/catch because a browser in private
 * mode can throw on the first read, and a diagnostic that throws is worse than one that is missing.
 */
export function collect(probe: Probe, build: string): Diagnostics {
  if (build.trim() === "") throw new Error("diagnostics: a build id is required");
  return {
    build: build.trim(),
    storage: probe.storage === true,
    crypto: probe.crypto === true,
    indexedDb: probe.indexedDb === true,
    fileProtocol: probe.fileProtocol === true,
    storageBytes: Math.max(0, Math.floor(probe.storageBytes ?? 0)),
  };
}

/** The environment as a browser reports it, with no note content anywhere in it. */
export function probeBrowser(): Probe {
  const has = (name: string): boolean => {
    try {
      return typeof (globalThis as unknown as Record<string, unknown>)[name] !== "undefined";
    } catch {
      return false;
    }
  };

  let storage = false;
  let storageBytes = 0;
  try {
    const key = "__probe__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    storage = true;
    for (let index = 0; index < localStorage.length; index += 1) {
      const name = localStorage.key(index);
      if (name) storageBytes += (localStorage.getItem(name) ?? "").length * 2;
    }
  } catch {
    storage = false;
  }

  return {
    storage,
    storageBytes,
    crypto: has("crypto") && typeof (globalThis as { crypto?: { subtle?: unknown } }).crypto?.subtle !== "undefined",
    indexedDb: has("indexedDB"),
    fileProtocol: typeof location !== "undefined" && location.protocol === "file:",
  };
}

/** Bytes as the status line shows them: one decimal, one unit. */
export function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${bytes} B`;
}
