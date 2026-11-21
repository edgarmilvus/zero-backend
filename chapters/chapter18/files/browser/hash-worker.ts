/**
 * The worker: one cheap hash over one buffer, and a checkpoint for cancellation.
 *
 * The work is deliberately synchronous and dumb: the chapter is about where it runs, not what it does.
 */

let cancelled = new Set<string>();

function fnv(buffer: Uint8Array): number {
  let hash = 2166136261;
  for (let index = 0; index < buffer.length; index += 1) {
    hash ^= buffer[index] as number;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

self.onmessage = (event: MessageEvent<{ type: string; id: string; buffer?: ArrayBuffer }>) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelled.add(message.id);
    return;
  }
  const started = performance.now();
  const bytes = new Uint8Array(message.buffer ?? new ArrayBuffer(0));
  if (cancelled.has(message.id)) {
    self.postMessage({ id: message.id, ok: false, error: "cancelled" });
    return;
  }
  const value = fnv(bytes);
  self.postMessage({ id: message.id, ok: true, value, ms: performance.now() - started, bytes: bytes.length });
};
