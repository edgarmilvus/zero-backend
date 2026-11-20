/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * Reads a photo record, asks the core to walk a JPEG's segments, and prints the numbers the ledger
 * needs. It decides nothing: the saving comes from the schema and the chain from the core.
 *
 *   node chapters/chapter06/files/exercises/ex5_photo.ts <photo.json> [jpg]
 */

import { readFileSync } from "node:fs";

import { countOf, walk } from "./segment_core.ts";
import { normalize, readPhoto } from "./photo_record.ts";

const APP1 = 0xe1;

export function main(argv: readonly string[]): number {
  const path = argv[0];
  const jpegPath = argv[1];
  if (!path) {
    console.error("usage: ex5_photo.ts <photo.json> [jpg]");
    return 2;
  }

  let photo;
  try {
    photo = readPhoto(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(photo);
  console.log(`photo            ${photo.name}`);
  console.log(`input            ${photo.inputBytes} bytes`);
  console.log(`output           ${photo.outputBytes} bytes, ${photo.format}`);
  console.log(`ratio            ${numbers.ratio.toFixed(1)}x smaller, ${numbers.savedBytes} bytes saved`);
  console.log(`metadata         ${numbers.metadataRemoved} segment(s) removed`);

  if (jpegPath) {
    const bytes = new Uint8Array(readFileSync(jpegPath));
    const frames = walk(bytes);
    console.log("");
    console.log(`container        ${frames.length} segments, ${countOf(frames, APP1)} APP1`);
  }

  return numbers.metadataRemoved > 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
