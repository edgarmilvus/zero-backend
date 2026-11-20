/**
 * Example 1 - what a phone puts in a JPEG, and what a muxer does not.
 *
 *   node chapters/chapter06/files/01_read_exif.ts
 *
 * The fixture has no APP1 segment, so the first half of the output is empty on purpose: a frame
 * extracted from a video carries no camera metadata. The second half writes a segment with this
 * chapter's own builder and reads it back, which is the only way to test a parser against every
 * branch of the format rather than one camera's habits.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildExifSegment,
  describeTags,
  insertAfterSoi,
  parseExif,
  readSegments,
} from "./exif.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "cover.jpg");

export function main(): number {
  const jpeg = new Uint8Array(readFileSync(FIXTURE));
  const segments = readSegments(jpeg);

  console.log(`file             cover.jpg, ${jpeg.byteLength} bytes`);
  console.log(
    `segments         ${segments.map((segment) => `0x${segment.marker.toString(16)}`).join(" ")}`,
  );
  console.log(`APP1 blocks      ${segments.filter((segment) => segment.marker === 0xe1).length}`);
  console.log("");

  const segment = buildExifSegment([
    { tag: 0x010f, value: "Apple" },
    { tag: 0x0110, value: "iPhone 15 Pro" },
    { tag: 0x0132, value: "2026:11:20 09:14:03" },
    { tag: 0x0112, value: 6 },
  ]);

  const withExif = insertAfterSoi(jpeg, segment);
  const tags = parseExif(withExif.subarray(6, 6 + segment.byteLength - 4));

  console.log(`injected APP1    ${segment.byteLength} bytes`);
  console.log(`tags             ${tags ? describeTags(tags) : "none"}`);
  console.log("");
  if (tags) {
    for (const tag of tags.tags) {
      console.log(`  ${tag.name.padEnd(12)} ${String(tag.value)}`);
    }
  }
  console.log("");
  console.log("a photo from a phone has twelve tags; a frame from a video has none");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
