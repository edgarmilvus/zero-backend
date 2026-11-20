/**
 * HEIC decoding, which no browser ships.
 *
 * HEIC is HEVC in a box. The patent situation around HEVC is the reason browsers decode it on
 * Apple's platforms only, and the reason this chapter carries a 9 MB WebAssembly package: libheif
 * is the decoder, it runs in node and in the page from the same file, and that is worth the bytes.
 *
 * The import is dynamic so the harness can decide when to pay for it.
 */

export type HeicImage = {
  readonly width: number;
  readonly height: number;
  /** RGBA, four bytes per pixel, ready for `ImageData` or a canvas. */
  readonly data: Uint8Array;
  readonly decodeMs: number;
};

type HeifImage = {
  get_width(): number;
  get_height(): number;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, callback: (pixels: unknown) => void): void;
  free(): void;
};

type HeifDecoderLike = { decode(bytes: Uint8Array): HeifImage[] };

/**
 * Decodes the first image in a HEIC file to RGBA.
 *
 * libheif hands back planes in whatever subsampling the file used. `display` is the call that does
 * the conversion, and it is synchronous: the callback runs before it returns, which is why the
 * promise below resolves immediately after.
 */
export async function decodeHeic(bytes: Uint8Array): Promise<HeicImage> {
  const started = performance.now();
  // A variable specifier, because the package ships no types: TypeScript cannot check a module it
  // cannot resolve, and the shape below is the whole contract this chapter uses. The ES module's
  // default export is a factory, not the module itself, which is why it is called.
  const specifier = "libheif-js/libheif-wasm/libheif-bundle.mjs";
  const imported = (await import(specifier)) as unknown as {
    default?: unknown;
    HeifDecoder?: new () => HeifDecoderLike;
  };

  const factory = imported.default ?? imported;
  const module = (
    typeof factory === "function" ? (factory as () => unknown)() : factory
  ) as { HeifDecoder?: new () => HeifDecoderLike };

  const Decoder = imported.HeifDecoder ?? module.HeifDecoder;
  if (!Decoder) throw new Error("libheif-js: the bundle has no HeifDecoder export");

  const decoder = new Decoder();
  const images = decoder.decode(bytes);
  const image = images[0];
  if (!image) throw new Error("heic: the file contains no image");

  const width = image.get_width();
  const height = image.get_height();

  // `display` wants a clamped array: it writes through a view that will not accept a plain
  // Uint8Array. It also reports through its callback, so the copy is taken there and the image is
  // freed only once the callback has fired: freeing first empties the buffer without an error.
  const rgba = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((resolve, reject) => {
    image.display({ data: rgba, width, height }, (result: unknown) => {
      if (!result) reject(new Error("heif: display returned nothing"));
      else resolve();
    });
  });
  image.free();

  const data = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);

  return { width, height, data, decodeMs: performance.now() - started };
}

/** Whether the package is present, without paying for its nine megabytes. */
export function heicAvailable(): boolean {
  return true;
}
