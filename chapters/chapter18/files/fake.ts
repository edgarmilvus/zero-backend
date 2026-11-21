/**
 * A worker that is a function: the harness's pool runs without a browser.
 *
 * The fake answers after a microtask, so the queue and the slot hand-off are exercised exactly as they
 * are with a real worker, and the test does not depend on a timing wheel.
 */

import type { WorkerLike } from "./pool.ts";

export type Fake = {
  readonly worker: WorkerLike;
  readonly received: unknown[];
  terminated: boolean;
};

export function fakeWorker(answer: (payload: unknown) => unknown = (payload) => payload): Fake {
  const received: unknown[] = [];
  const cancelled = new Set<string>();
  const state = { onmessage: null as ((event: { data: unknown }) => void) | null, terminated: false };

  const worker: WorkerLike = {
    postMessage(message: unknown, _transfer?: readonly ArrayBuffer[]) {
      const command = message as { type?: string; id?: string; payload?: unknown };
      received.push(message);
      if (command.type === "cancel") {
        if (command.id) cancelled.add(command.id);
        return;
      }
      const id = command.id ?? "";
      queueMicrotask(() => {
        if (state.terminated) return;
        if (cancelled.has(id)) {
          state.onmessage?.({ data: { id, ok: false, error: "cancelled" } });
          return;
        }
        try {
          state.onmessage?.({ data: { id, ok: true, value: answer(command.payload) } });
        } catch (error) {
          state.onmessage?.({ data: { id, ok: false, error: (error as Error).message } });
        }
      });
    },
    get onmessage() {
      return state.onmessage;
    },
    set onmessage(handler) {
      state.onmessage = handler;
    },
    terminate() {
      state.terminated = true;
    },
  };

  return {
    worker,
    received,
    get terminated() {
      return state.terminated;
    },
  };
}
