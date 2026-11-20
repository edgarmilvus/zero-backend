/**
 * The capabilities the book cares about, and the rung each one is on.
 *
 * A feature is not a capability. `SharedArrayBuffer` is a feature; "I can run code on a
 * second thread and block on it" is a capability, and it needs three features at once.
 * This file is the list, and it is deliberately short: twelve entries, each one used by a
 * named chapter, each one with a fallback that costs something a reader can see.
 */

export type CapabilityId =
  | "workers"
  | "offscreen-canvas"
  | "indexeddb"
  | "compression-streams"
  | "wasm"
  | "wasm-streaming"
  | "threads"
  | "webcodecs"
  | "opfs"
  | "opfs-sync"
  | "webgpu"
  | "file-system-access";

/** Rungs, not features. A machine is at tier N when every rung up to N is present. */
export type Tier = 0 | 1 | 2 | 3;

export type Capability = {
  readonly id: CapabilityId;
  readonly tier: Tier;
  /** What a reader would see in a browser console. */
  readonly label: string;
  /** Capabilities that must be present before this one means anything. */
  readonly needs: readonly CapabilityId[];
  /** The chapter that cannot run without it. */
  readonly chapter: number;
  /** What the book does instead, when this is missing. */
  readonly fallback: string;
};

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "workers",
    tier: 1,
    label: "Web Workers",
    needs: [],
    chapter: 3,
    fallback: "everything on the main thread, and the page freezes during a job",
  },
  {
    id: "offscreen-canvas",
    tier: 1,
    label: "OffscreenCanvas",
    needs: ["workers"],
    chapter: 6,
    fallback: "decode on the main thread, one frame at a time",
  },
  {
    id: "indexeddb",
    tier: 1,
    label: "IndexedDB",
    needs: [],
    chapter: 9,
    fallback: "no persistence between visits",
  },
  {
    id: "compression-streams",
    tier: 1,
    label: "CompressionStream",
    needs: [],
    chapter: 17,
    fallback: "a JavaScript deflate, slower and larger",
  },
  {
    id: "wasm",
    tier: 2,
    label: "WebAssembly",
    needs: [],
    chapter: 4,
    fallback: "no FFmpeg: the chapter is the end of the book",
  },
  {
    id: "wasm-streaming",
    tier: 2,
    label: "WebAssembly.compileStreaming",
    needs: ["wasm"],
    chapter: 4,
    fallback: "fetch the module as bytes, then compile",
  },
  {
    id: "threads",
    tier: 2,
    label: "SharedArrayBuffer, cross-origin isolated",
    needs: ["workers"],
    chapter: 4,
    fallback: "single-threaded FFmpeg: one core, roughly a third of the speed",
  },
  {
    id: "webcodecs",
    tier: 2,
    label: "WebCodecs (VideoDecoder, VideoEncoder)",
    needs: [],
    chapter: 5,
    fallback: "stay on FFmpeg for every decode, and pay for it",
  },
  {
    id: "opfs",
    tier: 3,
    label: "Origin Private File System",
    needs: [],
    chapter: 3,
    fallback: "memory only: a reload loses the upload",
  },
  {
    id: "opfs-sync",
    tier: 3,
    label: "OPFS synchronous access handles",
    needs: ["opfs", "workers"],
    chapter: 3,
    fallback: "asynchronous writes, and a slower FFmpeg file layer",
  },
  {
    id: "webgpu",
    tier: 3,
    label: "WebGPU",
    needs: [],
    chapter: 6,
    fallback: "WebGL, or a CPU filter at a fraction of the throughput",
  },
  {
    id: "file-system-access",
    tier: 3,
    label: "File System Access",
    needs: [],
    chapter: 3,
    fallback: "a download per file, chosen by the user",
  },
];

/** The same list, grouped by rung, index 0 to 3. */
export function byTier(): readonly (readonly Capability[])[] {
  const tiers: Capability[][] = [[], [], [], []];
  for (const capability of CAPABILITIES) tiers[capability.tier]?.push(capability);
  return tiers;
}

/** Chapter number to the capabilities that chapter cannot run without. */
export function chapterNeeds(): ReadonlyMap<number, readonly CapabilityId[]> {
  const needs = new Map<number, CapabilityId[]>();
  for (const capability of CAPABILITIES) {
    const list = needs.get(capability.chapter) ?? [];
    list.push(capability.id);
    needs.set(capability.chapter, list);
  }
  return needs;
}
