/**
 * Example 3 - what a batch decides before it touches a pixel.
 *
 *   node chapters/chapter06/files/03_plan_a_batch.ts
 *
 * Four hundred photos, one target size, three formats. The point is the refusal: AVIF is a format
 * this browser decodes and does not encode, and a batch that asks for it produces four hundred
 * PNGs with the wrong extension unless something checks first.
 */

import { planBatch, targetSize, type PhotoJob, type Target } from "./plan.ts";

const JOBS: readonly PhotoJob[] = [
  { name: "IMG_0001.heic", sourceBytes: 3_400_000, format: "heic", width: 4032, height: 3024 },
  { name: "IMG_0002.heic", sourceBytes: 3_100_000, format: "heic", width: 4032, height: 3024 },
  { name: "IMG_0003.jpg", sourceBytes: 2_200_000, format: "jpeg", width: 3024, height: 4032 },
  { name: "IMG_0004.png", sourceBytes: 900_000, format: "png", width: 800, height: 600 },
];

const TARGET: Target = { maxWidth: 1600, quality: 0.8, format: "webp" };

export function main(): number {
  console.log("sizes at 1600 wide, keeping the aspect ratio:");
  for (const job of JOBS) {
    const size = targetSize(job, TARGET.maxWidth);
    console.log(
      `  ${job.name.padEnd(14)} ${job.width}x${job.height} -> ${size.width}x${size.height}` +
        `${size.scaled ? "" : "  (not upscaled)"}`,
    );
  }
  console.log("");

  const webp = planBatch(JOBS, TARGET, { webp: true, avif: false }, 8_000_000);
  console.log(`webp, 400 photos   about ${webp.totalEstimatedBytes} bytes for these four`);
  console.log(`refused            ${webp.planned.filter((job) => job.refused).length}`);
  console.log("");

  const avif = planBatch(JOBS, { ...TARGET, format: "avif" }, { webp: true, avif: false }, 8_000_000);
  const refusal = avif.planned[0]?.refused;
  console.log(`avif               every job refused`);
  if (refusal) {
    console.log(`  reason           ${refusal.reason}`);
    console.log(`  ceiling          ${refusal.ceiling}`);
    console.log(`  fallback         chapter ${refusal.fallbackChapter}`);
  }
  console.log("");

  const tight = planBatch(JOBS, TARGET, { webp: true, avif: false }, 10_000);
  console.log(`budget 10 kB       ${tight.planned.filter((job) => job.refused).length} of ${JOBS.length} refused`);
  console.log("");
  console.log("the plan is the cheap half: no pixels are touched until it says yes");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
