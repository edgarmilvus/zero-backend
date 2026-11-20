/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * Reads a clip record, asks the core for the container's shape, and prints the numbers the ledger
 * needs. It decides nothing: the duration comes from the schema and the tree from the core.
 *
 *   node chapters/chapter05/files/exercises/ex5_clip.ts <clip.json>
 */

import { readFileSync } from "node:fs";

import { read, path } from "./box_core.ts";
import { normalize, readClip } from "./clip_record.ts";

export function main(argv: readonly string[]): number {
  const clipPath = argv[0];
  const boxPath = argv[1];
  if (!clipPath) {
    console.error("usage: ex5_clip.ts <clip.json> [container.mp4]");
    return 2;
  }

  let clip;
  try {
    clip = readClip(clipPath);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(clip);

  console.log(`codec            ${clip.codec}`);
  console.log(`frames           ${clip.frames} at ${clip.fps} fps = ${numbers.durationMs} ms`);
  console.log(`keyframes        ${clip.keyframes}, share ${(numbers.keyShare * 100).toFixed(0)}%`);
  console.log(`bytes            ${clip.bytes}, ${numbers.bytesPerFrame} per frame`);

  if (boxPath) {
    const bytes = new Uint8Array(readFileSync(boxPath));
    const tree = read(bytes);
    const deepest = path(tree).reduce((a, b) => (a.length >= b.length ? a : b));
    console.log("");
    console.log(`container         ${bytes.byteLength} bytes, ${path(tree).length} boxes`);
    console.log(`deepest path      ${deepest}`);
  }

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
