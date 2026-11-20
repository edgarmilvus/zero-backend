/**
 * The page: one HEIC and one JPEG through the same pipeline.
 *
 * It imports the modules the harness tests — the EXIF reader, the plan, the encoder check, the HEIC
 * decoder — and adds the two things only a browser has: `createImageBitmap` and a canvas.
 */

import { readSegments, stripMetadata, buildExifSegment, insertAfterSoi } from "../exif.ts";
import { targetSize } from "../plan.ts";
import { encodeWith, supportedFormats } from "../encode.ts";
import { decodeHeic } from "../heic.ts";
import type { PhotoResult } from "../report.ts";

export type PipelineOutput = {
  readonly results: readonly PhotoResult[];
  readonly formats: Readonly<Record<string, boolean>>;
  readonly heicSegments: number;
  readonly jpegSegments: number;
  readonly strippedSegments: number;
};

async function bitmapFrom(bytes: Uint8Array): Promise<ImageBitmap> {
  // A fresh view, because Blob wants an ArrayBuffer-backed one and a subarray need not be.
  return createImageBitmap(new Blob([new Uint8Array(bytes)]));
}

/** Draws a decoded picture at the target size and encodes it. */
async function resizeAndEncode(
  source: ImageBitmap | { width: number; height: number; data: Uint8Array },
  maxWidth: number,
): Promise<{ bytes: number; width: number; height: number; encodeMs: number; type: string }> {
  const size = targetSize({ width: source.width, height: source.height }, maxWidth);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas: no 2d context");

  if (source instanceof ImageBitmap) {
    context.drawImage(source, 0, 0, size.width, size.height);
  } else {
    const image = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    const full = new OffscreenCanvas(source.width, source.height);
    full.getContext("2d")?.putImageData(image, 0, 0);
    context.drawImage(full, 0, 0, size.width, size.height);
  }

  const encoded = await encodeWith(canvas, "image/webp", 0.8);
  return {
    bytes: encoded.bytes,
    width: size.width,
    height: size.height,
    encodeMs: encoded.wallClockMs,
    type: encoded.type,
  };
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function runPipeline(): Promise<PipelineOutput> {
  const formats = await supportedFormats();

  const heicBytes = await fetchBytes("/fixtures/cover.heic");
  const jpegBytes = await fetchBytes("/fixtures/cover.jpg");

  // The HEIC has no EXIF: it is a frame extracted from a video. The JPEG is given one, so the
  // strip below has something to remove and the record can prove it removed it.
  const withExif = insertAfterSoi(
    jpegBytes,
    buildExifSegment([
      { tag: 0x010f, value: "Apple" },
      { tag: 0x0110, value: "iPhone 15 Pro" },
      { tag: 0x0112, value: 6 },
    ]),
  );

  const heicStart = performance.now();
  const heic = await decodeHeic(heicBytes);
  const heicDecodeMs = performance.now() - heicStart;

  const jpegStart = performance.now();
  const jpegBitmap = await bitmapFrom(withExif);
  const jpegDecodeMs = performance.now() - jpegStart;

  const heicEncoded = await resizeAndEncode(heic, 320);
  const jpegEncoded = await resizeAndEncode(jpegBitmap, 320);

  const before = readSegments(withExif).filter((segment) => segment.marker === 0xe1).length;
  const stripped = stripMetadata(withExif);
  const after = readSegments(stripped.bytes).filter((segment) => segment.marker === 0xe1).length;

  const results: PhotoResult[] = [
    {
      name: "cover.heic",
      inputBytes: heicBytes.byteLength,
      outputBytes: heicEncoded.bytes,
      format: heicEncoded.type,
      width: heicEncoded.width,
      height: heicEncoded.height,
      decodeMs: heicDecodeMs,
      encodeMs: heicEncoded.encodeMs,
      metadataRemoved: 0,
    },
    {
      name: "cover.jpg",
      inputBytes: withExif.byteLength,
      outputBytes: jpegEncoded.bytes,
      format: jpegEncoded.type,
      width: jpegEncoded.width,
      height: jpegEncoded.height,
      decodeMs: jpegDecodeMs,
      encodeMs: jpegEncoded.encodeMs,
      metadataRemoved: before - after,
    },
  ];

  return {
    results,
    formats,
    heicSegments: readSegments(heicBytes).length,
    jpegSegments: readSegments(withExif).length,
    strippedSegments: before,
  };
}

declare global {
  interface Window {
    __pipeline: () => Promise<PipelineOutput>;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const button = document.querySelector<HTMLButtonElement>("#run");

  const run = async (): Promise<void> => {
    if (status) status.textContent = "decoding, stripping, encoding...";
    try {
      const result = await runPipeline();
      if (status) {
        status.textContent = `${result.results.length} photos, ${result.strippedSegments} metadata block(s) removed`;
      }
      if (output) {
        output.textContent = result.results
          .map(
            (photo) =>
              `${photo.name.padEnd(12)} ${String(photo.inputBytes).padStart(7)} -> ${String(
                photo.outputBytes,
              ).padStart(7)} bytes  ${photo.format} ${photo.width}x${photo.height}  ` +
              `decode ${photo.decodeMs.toFixed(1)} ms, encode ${photo.encodeMs.toFixed(1)} ms`,
          )
          .join("\n");
      }
    } catch (error) {
      if (status) status.textContent = `failed: ${(error as Error).message}`;
    }
  };

  window.__pipeline = runPipeline;
  button?.addEventListener("click", () => void run());
}
