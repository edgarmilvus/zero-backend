/**
 * The only file that touches the machine.
 *
 * Every access is wrapped, because the interesting capabilities throw rather than return
 * false: a `FileSystemFileHandle.prototype` lookup on an engine that does not have the class
 * is an exception, not a falsy value. A probe that dies on the first surprise reports less
 * than the browser can do, which is the one failure mode this chapter cannot afford.
 */

import type { CapabilityId } from "./capabilities.ts";
import type { Capabilities } from "./probe.ts";

const WASM_HEADER = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/** Anything at all can be a global object in a test, so the lookup is untyped on purpose. */
type AnyRoot = Record<string, unknown>;

function safe<T>(fn: () => T, ifItThrows: T): T {
  try {
    return fn();
  } catch {
    return ifItThrows;
  }
}

export function hasGlobal(path: string, root: AnyRoot = globalThis as unknown as AnyRoot): boolean {
  const value = path.split(".").reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    return (current as AnyRoot)[key];
  }, root);
  return value !== undefined && value !== null;
}

/**
 * Probe the environment by doing, one capability at a time.
 *
 * `root` is a parameter so the harness can pass a fake machine. In a browser it is
 * `globalThis`, and the function never reads `navigator.userAgent`.
 */
export function detectCapabilities(root: AnyRoot = globalThis as unknown as AnyRoot): Capabilities {
  const wasm = safe(() => {
    const module = root.WebAssembly as
      | { validate?: (bytes: Uint8Array) => boolean; compileStreaming?: unknown }
      | undefined;
    return typeof module?.validate === "function" && module.validate(WASM_HEADER) === true;
  }, false);

  const opfs = safe(() => {
    const storage = (root.navigator as AnyRoot | undefined)?.storage as
      | { getDirectory?: unknown }
      | undefined;
    return typeof storage?.getDirectory === "function";
  }, false);

  const opfsSync = safe(() => {
    if (!opfs) return false;
    const handle = root.FileSystemFileHandle as
      | { prototype?: AnyRoot }
      | undefined;
    return typeof handle?.prototype?.createSyncAccessHandle === "function";
  }, false);

  const present: Partial<Record<CapabilityId, boolean>> = {
    workers: safe(() => typeof root.Worker === "function", false),
    "offscreen-canvas": safe(() => typeof root.OffscreenCanvas === "function", false),
    indexeddb: safe(() => hasGlobal("indexedDB", root), false),
    "compression-streams": safe(() => typeof root.CompressionStream === "function", false),
    wasm,
    "wasm-streaming": safe(() => {
      if (!wasm) return false;
      const module = root.WebAssembly as { compileStreaming?: unknown } | undefined;
      return typeof module?.compileStreaming === "function";
    }, false),
    webcodecs: safe(
      () => typeof root.VideoDecoder === "function" && typeof root.VideoEncoder === "function",
      false,
    ),
    opfs,
    "opfs-sync": opfsSync,
    webgpu: safe(() => hasGlobal("navigator.gpu", root), false),
    "file-system-access": safe(() => typeof root.showOpenFilePicker === "function", false),
  };

  return {
    crossOriginIsolated: safe(() => root.crossOriginIsolated === true, false),
    sharedArrayBuffer: safe(() => typeof root.SharedArrayBuffer === "function", false),
    present,
  };
}
