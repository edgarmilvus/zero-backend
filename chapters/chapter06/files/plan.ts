/**
 * What a batch decides before it touches a pixel: which size, which format, which quality, and
 * which photos are refused.
 *
 * The arithmetic is the same as every other chapter's: a target, a budget, and a refusal with three
 * fields when the platform cannot deliver what was asked.
 */

export type SourceFormat = "jpeg" | "heic" | "png";
export type OutputFormat = "webp" | "jpeg" | "avif";

export type PhotoJob = {
  readonly name: string;
  readonly sourceBytes: number;
  readonly format: SourceFormat;
  readonly width: number;
  readonly height: number;
};

export type Target = {
  /** Longest side, in pixels. The short side follows the aspect ratio. */
  readonly maxWidth: number;
  /** Per format: the number means different things and is never comparable across formats. */
  readonly quality: number;
  readonly format: OutputFormat;
};

export type PlatformSupport = {
  readonly webp: boolean;
  readonly avif: boolean;
};

export type Refusal = {
  readonly reason: string;
  readonly ceiling: string;
  readonly fallbackChapter: number;
};

/** The size a photo is drawn at, keeping the aspect ratio and never upscaling. */
export function targetSize(
  source: { readonly width: number; readonly height: number },
  maxWidth: number,
): { readonly width: number; readonly height: number; readonly scaled: boolean } {
  if (maxWidth <= 0) throw new Error(`maxWidth: expected a positive number, got ${maxWidth}`);
  if (source.width <= maxWidth) {
    return { width: source.width, height: source.height, scaled: false };
  }
  const ratio = maxWidth / source.width;
  return {
    width: maxWidth,
    height: Math.max(1, Math.round(source.height * ratio)),
    scaled: true,
  };
}

/**
 * AVIF is the case this function exists for.
 *
 * Chrome decodes AVIF and does not encode it: `convertToBlob({ type: "image/avif" })` answers with
 * a PNG and no error. A batch that asks for AVIF without asking the platform first produces a
 * folder of PNGs with the wrong extension.
 */
export function refuseUnsupported(target: Target, support: PlatformSupport): Refusal | null {
  if (target.format === "avif" && !support.avif) {
    return {
      reason: "this browser cannot encode AVIF, and asking for it returns a PNG instead",
      ceiling: "the platform's encoder list, which the page cannot extend",
      fallbackChapter: 6,
    };
  }
  if (target.format === "webp" && !support.webp) {
    return {
      reason: "this browser cannot encode WebP",
      ceiling: "the platform's encoder list",
      fallbackChapter: 6,
    };
  }
  return null;
}

export type PlannedJob = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly estimatedBytes: number;
  readonly refused: Refusal | null;
};

/**
 * A first guess at the output size, from the pixels and the quality.
 *
 * It is a guess and it is labelled one: bits per pixel is a property of the picture, not of the
 * format, and a photo of grass is five times the size of a photo of a wall at the same quality. The
 * budget uses it to decide what to attempt, and the record keeps the real number next to it.
 */
export function estimateBytes(width: number, height: number, quality: number, format: OutputFormat): number {
  const bitsPerPixel = format === "jpeg" ? 0.6 : format === "webp" ? 0.5 : 0.35;
  return Math.round((width * height * bitsPerPixel * quality) / 8);
}

export function planBatch(
  jobs: readonly PhotoJob[],
  target: Target,
  support: PlatformSupport,
  budgetBytes: number,
): { readonly planned: readonly PlannedJob[]; readonly totalEstimatedBytes: number } {
  const refusal = refuseUnsupported(target, support);
  const planned: PlannedJob[] = [];
  let total = 0;

  for (const job of jobs) {
    const size = targetSize(job, target.maxWidth);
    const estimated = estimateBytes(size.width, size.height, target.quality, target.format);
    if (!refusal) total += estimated;
    planned.push({
      name: job.name,
      width: size.width,
      height: size.height,
      estimatedBytes: estimated,
      refused: refusal,
    });
  }

  if (total > budgetBytes && !refusal) {
    return {
      planned: planned.map((job) => ({
        ...job,
        refused: {
          reason: `the batch needs about ${total} bytes and the budget is ${budgetBytes}`,
          ceiling: "the storage budget this page was given",
          fallbackChapter: 3,
        },
      })),
      totalEstimatedBytes: total,
    };
  }

  return { planned, totalEstimatedBytes: total };
}
