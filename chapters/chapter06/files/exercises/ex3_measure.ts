/**
 * Exercise 3 - the quality dial that means three different things.
 *
 * 0.8 in WebP, 0.8 in JPEG and 0.8 in AVIF are three products. A batch that applies one number
 * everywhere produces three files that look different at the same setting, and the only thing
 * comparable before the encode is an estimate with the format in it.
 */

import { estimateBytes, type OutputFormat } from "../plan.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

export const FORMATS: readonly OutputFormat[] = ["jpeg", "webp", "avif"];

/** The ratio between two formats at the same setting, which is what a batch has to know. */
export function relativeSize(from: OutputFormat, to: OutputFormat, width: number, height: number, quality: number): number {
  return estimateBytes(width, height, quality, to) / estimateBytes(width, height, quality, from);
}

/** The quality to ask of `to` so it lands near what `from` produced at its own scale. */
export function equivalentQuality(
  from: OutputFormat,
  to: OutputFormat,
  width: number,
  height: number,
  quality: number,
): number {
  const target = estimateBytes(width, height, quality, from);
  let low = 0.1;
  let high = 1;
  for (let step = 0; step < 40; step += 1) {
    const mid = (low + high) / 2;
    if (estimateBytes(width, height, mid, to) > target) high = mid;
    else low = mid;
  }
  return Math.round(((low + high) / 2) * 100) / 100;
}

export const checks: readonly Check[] = [
  {
    name: "jpeg is estimated larger than webp at the same setting",
    run: () => expect(estimateBytes(1000, 1000, 0.8, "jpeg") > estimateBytes(1000, 1000, 0.8, "webp"), "jpeg"),
  },
  {
    name: "avif is estimated smallest of the three",
    run: () =>
      expect(
        estimateBytes(1000, 1000, 0.8, "avif") < estimateBytes(1000, 1000, 0.8, "webp"),
        "avif",
      ),
  },
  {
    name: "the three formats are three different numbers at 0.8",
    run: () => {
      const values = FORMATS.map((format) => estimateBytes(1600, 1200, 0.8, format));
      return eq(new Set(values).size, 3, "distinct");
    },
  },
  {
    name: "the ratio from jpeg to webp is below one",
    run: () => expect(relativeSize("jpeg", "webp", 1600, 1200, 0.8) < 1, "ratio"),
  },
  {
    name: "the ratio from webp to avif is below one",
    run: () => expect(relativeSize("webp", "avif", 1600, 1200, 0.8) < 1, "ratio"),
  },
  {
    name: "an equivalent quality for a smaller format is higher",
    run: () => expect(equivalentQuality("jpeg", "avif", 1600, 1200, 0.8) > 0.8, "quality"),
  },
  {
    name: "an equivalent quality for a larger format is lower",
    run: () => expect(equivalentQuality("avif", "jpeg", 1600, 1200, 0.8) < 0.8, "quality"),
  },
  {
    name: "the same format at the same quality is equivalent to itself",
    run: () => expect(Math.abs(equivalentQuality("webp", "webp", 800, 600, 0.7) - 0.7) < 0.05, "quality"),
  },
  {
    name: "a bigger picture costs more bytes at every quality",
    run: () =>
      expect(
        estimateBytes(1600, 1200, 0.8, "webp") > estimateBytes(800, 600, 0.8, "webp"),
        "size",
      ),
  },
  {
    name: "quality is monotonic in every format",
    run: () =>
      expect(
        FORMATS.every(
          (format) =>
            estimateBytes(800, 600, 0.9, format) > estimateBytes(800, 600, 0.5, format),
        ),
        "monotonic",
      ),
  },
];

export function main(): number {
  for (const quality of [0.6, 0.8, 0.95]) {
    const row = FORMATS.map(
      (format) => `${format} ${String(estimateBytes(1600, 1200, quality, format)).padStart(7)}`,
    );
    console.log(`quality ${quality.toFixed(2)}   ${row.join("   ")}`);
  }
  console.log("");
  console.log("the number is a dial whose meaning changes with the format, which is why a batch cannot reuse it");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
