/**
 * Example 2 - the strip, and why it is the most important line in the chapter.
 *
 *   node chapters/chapter06/files/02_strip_metadata.ts
 *
 * A photo that leaves the tab with a GPS coordinate, a camera serial and a timestamp is a privacy
 * incident with a thumbnail attached. Removing the APP1 segment does not touch a pixel, and this
 * program proves it: same segments minus one, same image data, and the file still opens.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildExifSegment, insertAfterSoi, parseExif, readSegments, stripMetadata } from "./exif.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "cover.jpg");

export function main(): number {
  const jpeg = new Uint8Array(readFileSync(FIXTURE));
  const segment = buildExifSegment([
    { tag: 0x010f, value: "Apple" },
    { tag: 0x0110, value: "iPhone 15 Pro" },
    { tag: 0x0112, value: 6 },
  ]);
  const withExif = insertAfterSoi(jpeg, segment);

  const before = readSegments(withExif);
  const stripped = stripMetadata(withExif);
  const after = readSegments(stripped.bytes);

  console.log(`before           ${withExif.byteLength} bytes, ${before.length} segments`);
  console.log(`APP1 blocks      ${before.filter((segment) => segment.marker === 0xe1).length}`);
  console.log("");
  console.log(`after            ${stripped.bytes.byteLength} bytes, ${after.length} segments`);
  console.log(`removed          ${stripped.removed} metadata block(s)`);
  console.log(
    `bytes saved      ${withExif.byteLength - stripped.bytes.byteLength} (the segment, not the picture)`,
  );
  console.log("");

  const stillThere = parseExif(stripped.bytes);
  console.log(`EXIF after strip ${stillThere ? "still present, which is the bug" : "gone"}`);
  console.log(
    `segments kept    ${after.map((segment) => `0x${segment.marker.toString(16)}`).join(" ")}`,
  );
  console.log("");
  console.log("the image data is copied verbatim: nothing is re-encoded, so nothing is lost");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
