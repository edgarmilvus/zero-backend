/**
 * Example 1 - read the fixture's box tree, and the four facts a decoder needs.
 *
 *   node chapters/chapter05/files/01_parse_the_fixture.ts
 *
 * The file is the one chapter 4 encoded, so the numbers match the previous chapter's record. The
 * program prints the top-level boxes, the path to the codec description and the summary a
 * `VideoDecoder.configure` call is built from.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readBoxes, walk } from "./boxes.ts";
import { readMp4 } from "./mp4.ts";
import { assertFixtureShape, renderSummary } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "..", "chapter04", "files", "fixtures", "sample.mp4");

export function main(): number {
  const bytes = new Uint8Array(readFileSync(FIXTURE));
  const boxes = readBoxes(bytes);

  console.log(`file             ${FIXTURE.split("/").slice(-1)[0]}, ${bytes.byteLength} bytes`);
  console.log(`top-level boxes  ${boxes.map((box) => `${box.type}(${box.bytes})`).join(" ")}`);
  console.log("");

  const paths = walk(boxes).map((entry) => entry.path);
  const codecPath = paths.find((path) => path.endsWith("/avcC"));
  console.log(`box count        ${paths.length}`);
  console.log(`deepest path     ${paths.reduce((a, b) => (a.length >= b.length ? a : b))}`);
  console.log(`codec boxes      ${codecPath ?? "none"}`);
  console.log("");

  const summary = readMp4(bytes);
  assertFixtureShape(summary);
  console.log(renderSummary(summary));

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
