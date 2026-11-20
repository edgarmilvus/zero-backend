/**
 * Encoding, and the check that the browser did what it was asked.
 *
 * `canvas.convertToBlob({ type })` is a request. When the platform cannot honour it, the call
 * resolves anyway and returns a PNG: no exception, no warning, and a pipeline that trusts its own
 * request ships a folder of PNGs with the wrong extension. This file exists for that check.
 */

export type EncodeFormat = "image/webp" | "image/jpeg" | "image/png" | "image/avif";

export type EncodeResult = {
  readonly bytes: number;
  readonly type: string;
  readonly requested: EncodeFormat;
  readonly wallClockMs: number;
};

/**
 * Encodes a canvas and refuses a result whose type is not the requested one.
 *
 * The refusal names both types, because "it did not work" is not a message a reader can act on and
 * "you asked for image/avif and got image/png" is.
 */
export async function encodeWith(
  canvas: { convertToBlob(options: { type: string; quality?: number }): Promise<Blob> },
  format: EncodeFormat,
  quality: number,
): Promise<EncodeResult> {
  if (quality < 0 || quality > 1) {
    throw new Error(`quality: expected a number between 0 and 1, got ${quality}`);
  }

  const started = performance.now();
  const blob = await canvas.convertToBlob({ type: format, quality });
  const wallClockMs = performance.now() - started;

  assertFormat(format, blob.type);

  return { bytes: blob.size, type: blob.type, requested: format, wallClockMs };
}

/** The one line that turns a silent fallback into an error. */
export function assertFormat(requested: string, actual: string): void {
  if (requested !== actual) {
    throw new Error(
      `encode: asked for ${requested} and the browser answered ${actual}, so the file is not what its name says`,
    );
  }
}

/** Which formats this browser will actually produce, tested by producing one small one. */
export async function supportedFormats(): Promise<Readonly<Record<string, boolean>>> {
  if (typeof OffscreenCanvas === "undefined") return {};
  const canvas = new OffscreenCanvas(8, 8);
  const context = canvas.getContext("2d");
  context?.fillRect(0, 0, 8, 8);

  const out: Record<string, boolean> = {};
  for (const format of ["image/webp", "image/jpeg", "image/avif"] as const) {
    try {
      const blob = await canvas.convertToBlob({ type: format });
      out[format] = blob.type === format;
    } catch {
      out[format] = false;
    }
  }
  return out;
}
