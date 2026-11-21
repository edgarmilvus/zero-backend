/**
 * The page: the same hash, on the main thread and in a pool, with the frame monitor on both.
 */

import { Pool, type WorkerLike } from "../pool.ts";

const SIZE = 16 * 1024 * 1024;
const TASKS = 6;

export type RunResult = {
  readonly mode: "serial" | "pooled";
  readonly tasks: number;
  readonly totalMs: number;
  readonly frames: number;
  readonly longestFrameMs: number;
  readonly values: readonly number[];
};

function fnv(buffer: Uint8Array): number {
  let hash = 2166136261;
  for (let index = 0; index < buffer.length; index += 1) {
    hash ^= buffer[index] as number;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function monitor(): { stop: () => { frames: number; longestFrameMs: number } } {
  const stamps: number[] = [performance.now()];
  let running = true;
  const tick = (at: number): void => {
    if (!running) return;
    stamps.push(at);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    stop: () => {
      running = false;
      stamps.push(performance.now());
      let longest = 0;
      for (let index = 1; index < stamps.length; index += 1) {
        longest = Math.max(longest, (stamps[index] as number) - (stamps[index - 1] as number));
      }
      return { frames: stamps.length, longestFrameMs: longest };
    },
  };
}

function buffers(): Uint8Array[] {
  return Array.from({ length: TASKS }, (_unused, index) => {
    const buffer = new Uint8Array(SIZE);
    buffer.fill(index + 1);
    return buffer;
  });
}

export async function serial(): Promise<RunResult> {
  // The buffers are allocated before the monitor starts: the chapter measures the hash, and a 96 MB
  // allocation is a different (and equally real) cost that would otherwise be attributed to it.
  const prepared = buffers();
  const watch = monitor();
  const started = performance.now();
  const values = prepared.map((buffer) => fnv(buffer));
  const totalMs = performance.now() - started;
  const frames = watch.stop();
  return { mode: "serial", tasks: TASKS, totalMs, values, ...frames };
}

function workerLike(): WorkerLike {
  const worker = new Worker("./hash-worker.ts", { type: "module" });
  return {
    postMessage(message: unknown, transfer?: readonly ArrayBuffer[]) {
      worker.postMessage(message, { transfer: [...(transfer ?? [])] as Transferable[] });
    },
    set onmessage(handler: ((event: { data: unknown }) => void) | null) {
      worker.onmessage = handler as ((event: MessageEvent) => void) | null;
    },
    get onmessage() {
      return worker.onmessage as ((event: { data: unknown }) => void) | null;
    },
    terminate() {
      worker.terminate();
    },
  };
}

// One pool for the page's lifetime: creating four workers costs more than the first batch of work, and
// a pool created per click pays that cost on every click.
let shared: Pool | null = null;

export async function pooled(): Promise<RunResult> {
  const prepared = buffers();
  const watch = monitor();
  const pool = (shared ??= new Pool(4, workerLike));
  const started = performance.now();
  const values = await Promise.all(
    prepared.map((buffer, index) =>
      pool.run<number>({ id: `h${index}`, payload: buffer.buffer as ArrayBuffer, transfer: [buffer.buffer as ArrayBuffer] }),
    ),
  );
  const totalMs = performance.now() - started;
  const frames = watch.stop();
  return { mode: "pooled", tasks: TASKS, totalMs, values, ...frames };
}

declare global {
  interface Window {
    __serial: () => Promise<RunResult>;
    __pooled: () => Promise<RunResult>;
    __lastPoolRun?: RunResult;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");

  const run = async (mode: "serial" | "pooled"): Promise<void> => {
    if (status) status.textContent = mode === "serial" ? "hashing on the main thread..." : "hashing in four workers...";
    const result = mode === "serial" ? await serial() : await pooled();
    window.__lastPoolRun = result;
    if (status) {
      status.textContent = `${mode}: ${result.totalMs.toFixed(0)} ms, longest frame ${result.longestFrameMs.toFixed(0)} ms`;
    }
    if (output) {
      output.textContent = [
        `mode              ${result.mode}`,
        `tasks             ${result.tasks} x ${(SIZE / 1024 / 1024).toFixed(0)} MB`,
        `total             ${result.totalMs.toFixed(0)} ms`,
        `frames            ${result.frames}, longest gap ${result.longestFrameMs.toFixed(0)} ms`,
        `results           ${result.values.map((value) => value.toString(16)).join(" ")}`,
      ].join("\n");
    }
  };

  document.querySelector("#serial")?.addEventListener("click", () => void run("serial"));
  document.querySelector("#pooled")?.addEventListener("click", () => void run("pooled"));
  window.__serial = serial;
  window.__pooled = pooled;
}
