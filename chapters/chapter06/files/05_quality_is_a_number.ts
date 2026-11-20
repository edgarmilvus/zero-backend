/**
 * Example 5 - one number, three meanings.
 *
 *   node chapters/chapter06/files/05_quality_is_a_number.ts
 *
 * 0.8 in WebP, 0.8 in JPEG and 0.8 in AVIF are three different products. A batch that picks one
 * number and applies it everywhere produces three files that look different at the same setting,
 * and the chapter's estimate is the only thing that can be compared before the encode.
 */

import { estimateBytes, type OutputFormat } from "./plan.ts";

const FORMATS: readonly OutputFormat[] = ["jpeg", "webp", "avif"];
const SIZES = [
  { label: "1600 wide", width: 1600, height: 1200 },
  { label: "800 wide", width: 800, height: 600 },
];

export function main(): number {
  for (const size of SIZES) {
    console.log(`${size.label}:`);
    for (const quality of [0.6, 0.75, 0.9]) {
      const row = FORMATS.map((format) =>
        `${format} ${String(estimateBytes(size.width, size.height, quality, format)).padStart(7)}`,
      );
      console.log(`  quality ${quality.toFixed(2)}   ${row.join("   ")}`);
    }
    console.log("");
  }

  console.log("the numbers are estimates from bits per pixel, and they are labelled as such");
  console.log("the record keeps the real size next to the estimate, which is the only way to learn the gap");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
