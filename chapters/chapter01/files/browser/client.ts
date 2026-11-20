/**
 * The client side of the ledger, running in a page.
 *
 * The work happens in a Worker for the reason every later chapter will repeat:
 * the main thread paints, the worker burns CPU. The measurement is the same
 * operation as 05_hash_the_file.ts, so the two numbers are comparable.
 *
 * The page exposes `window.__measure(file)` so a recording script can drive the
 * exact code path a user drives. A measurement nobody can reproduce is a
 * screenshot, not a record.
 */

export type BrowserMeasurement = {
  readonly bytes: number;
  readonly wallClockMs: number;
  readonly peakHeapBytes: number | null;
  readonly sha256: string;
  readonly isolated: boolean;
};

const WORKER_SOURCE = `
self.onmessage = async (event) => {
  const { buffer } = event.data;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  self.postMessage({ sha256, bytes: buffer.byteLength });
};
`;

function workerUrl(): string {
  return URL.createObjectURL(
    new Blob([WORKER_SOURCE], { type: "text/javascript" }),
  );
}

/**
 * Read the file whole, hand the bytes to a worker, time the round trip.
 *
 * The clock runs on the page, not in the worker: a worker and its page have
 * different time origins, so a timestamp taken on one side and compared on the
 * other produces negative durations. The number the ledger wants is the one the
 * user feels, which starts before the worker does.
 */
export function measureInPage(file: File): Promise<BrowserMeasurement> {
  return new Promise((resolve, reject) => {
    const url = workerUrl();
    const worker = new Worker(url);
    const startedAt = performance.now();

    worker.onmessage = (event: MessageEvent) => {
      const wallClockMs = performance.now() - startedAt;
      const { sha256, bytes } = event.data as { sha256: string; bytes: number };
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } })
        .memory;
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        bytes,
        wallClockMs,
        peakHeapBytes: memory ? memory.usedJSHeapSize : null,
        sha256,
        isolated: crossOriginIsolated,
      });
    };

    worker.onerror = (event) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(new Error(`worker failed: ${event.message}`));
    };

    file
      .arrayBuffer()
      .then((buffer) => {
        worker.postMessage({ buffer }, [buffer]);
      })
      .catch(reject);
  });
}

/** The same call the button makes, without the DOM, for a recording script. */
export async function reportToWorker(file: File): Promise<BrowserMeasurement> {
  return measureInPage(file);
}

declare global {
  interface Window {
    __measure: (file: File) => Promise<BrowserMeasurement>;
    __lastMeasurement: BrowserMeasurement | null;
  }
}

if (typeof window !== "undefined") {
  window.__lastMeasurement = null;

  const output = document.querySelector<HTMLPreElement>("#out");
  const input = document.querySelector<HTMLInputElement>("#file");
  const isolation = document.querySelector<HTMLParagraphElement>("#isolation");

  if (isolation) {
    isolation.className = crossOriginIsolated ? "iso" : "not-iso";
    isolation.textContent = crossOriginIsolated
      ? "cross-origin isolated: SharedArrayBuffer available, worker has its own thread"
      : "NOT cross-origin isolated: the COOP/COEP headers are missing";
  }

  const run = async (file: File): Promise<void> => {
    if (!output) return;
    output.textContent = `measuring ${file.name} (${file.size} bytes)...`;
    const measurement = await reportToWorker(file);
    window.__lastMeasurement = measurement;
    output.textContent = JSON.stringify(measurement, null, 2);
  };

  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void run(file);
  });

  window.__measure = async (file: File) => {
    const measurement = await reportToWorker(file);
    window.__lastMeasurement = measurement;
    return measurement;
  };
}
