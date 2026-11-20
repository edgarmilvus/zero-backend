/**
 * Exercise 4 - the file that cannot be chunked from the front.
 *
 * A format whose index sits at the end cannot be processed as a stream: the reader has to know where
 * the index is before it can decode the first frame. A pipeline that assumes chunking works pays for a
 * full read to find a footer.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Layout = "index-at-front" | "index-at-end" | "no-index";

export type Format = {
  readonly name: string;
  readonly layout: Layout;
  readonly footerBytes: number;
};

export const FORMATS: readonly Format[] = [
  { name: "wav", layout: "no-index", footerBytes: 0 },
  { name: "mp4-faststart", layout: "index-at-front", footerBytes: 0 },
  { name: "mp4", layout: "index-at-end", footerBytes: 2_000_000 },
  { name: "zip", layout: "index-at-end", footerBytes: 65_536 },
];

export type Plan = {
  readonly streamable: boolean;
  readonly firstReadBytes: number;
  readonly reason: string;
};

/** The bug: chunk every format from the front. */
export function streamEverything(sizeBytes: number, chunkBytes: number): number {
  return Math.min(sizeBytes, chunkBytes);
}

/** The repair: a format with a footer costs the footer before it streams. */
export function planReads(format: Format, sizeBytes: number, chunkBytes: number): Plan {
  if (format.layout === "no-index") {
    return { streamable: true, firstReadBytes: Math.min(sizeBytes, chunkBytes), reason: "no index to find" };
  }
  if (format.layout === "index-at-front") {
    return { streamable: true, firstReadBytes: Math.min(sizeBytes, chunkBytes), reason: "the index is already first" };
  }
  return {
    streamable: true,
    firstReadBytes: Math.min(sizeBytes, format.footerBytes),
    reason: `the index is at the end, so the last ${format.footerBytes} bytes come first`,
  };
}

const SIZE = 4e9;
const CHUNK = 64e6;

export const checks: readonly Check[] = [
  {
    name: "a wav streams from the front",
    run: () => eq(planReads(FORMATS[0]!, SIZE, CHUNK).firstReadBytes, CHUNK, "bytes"),
  },
  {
    name: "a faststart mp4 streams from the front",
    run: () => eq(planReads(FORMATS[1]!, SIZE, CHUNK).firstReadBytes, CHUNK, "bytes"),
  },
  {
    name: "a plain mp4 reads its footer first",
    run: () => eq(planReads(FORMATS[2]!, SIZE, CHUNK).firstReadBytes, 2_000_000, "bytes"),
  },
  {
    name: "a zip reads its last 64 kB first",
    run: () => eq(planReads(FORMATS[3]!, SIZE, CHUNK).firstReadBytes, 65_536, "bytes"),
  },
  {
    name: "the bug reads the front, which is not where the index is",
    run: () => {
      const wrong = streamEverything(SIZE, CHUNK);
      const right = planReads(FORMATS[2]!, SIZE, CHUNK).firstReadBytes;
      eq(wrong, CHUNK, "first read");
      // Both are reads of the same file, and only one of them contains the table the decoder needs
      // before its first frame.
      return expect(wrong !== right, "the bug and the repair read the same bytes");
    },
  },
  {
    name: "the footer read is a range, not a whole file",
    run: () => expect(planReads(FORMATS[3]!, SIZE, CHUNK).firstReadBytes < SIZE, "whole file"),
  },
  {
    name: "a footer larger than the file reads the file",
    run: () => eq(planReads(FORMATS[2]!, 1000, CHUNK).firstReadBytes, 1000, "bytes"),
  },
  {
    name: "every format is still streamable after the footer",
    run: () => expect(FORMATS.every((format) => planReads(format, SIZE, CHUNK).streamable), "not streamable"),
  },
  {
    name: "the reason names the layout",
    run: () => expect(planReads(FORMATS[3]!, SIZE, CHUNK).reason.includes("at the end"), "reason"),
  },
];

export function main(): number {
  for (const format of FORMATS) {
    const plan = planReads(format, SIZE, CHUNK);
    console.log(
      `${format.name.padEnd(16)} ${String((plan.firstReadBytes / 1e6).toFixed(1)).padStart(6)} MB first  ${plan.reason}`,
    );
  }
  console.log("");
  console.log("a footer is not a wall: it is one read, and then the stream starts where the index says");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
