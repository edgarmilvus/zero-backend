/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * A segment chain as a value: a marker, a byte range, and the payload's length. No buffer
 * ownership, no decoding, no canvas. That is what lets the capstone audit a folder of JPEGs on a
 * machine with no image support at all.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Frame = {
  readonly marker: number;
  readonly start: number;
  readonly bytes: number;
};

export function walk(bytes: Uint8Array): readonly Frame[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames: Frame[] = [];
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return [];

  let at = 2;
  while (at + 4 <= bytes.byteLength) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xda) {
      frames.push({ marker, start: at, bytes: bytes.byteLength - at });
      break;
    }
    const length = view.getUint16(at + 2, false);
    if (length < 2 || at + 2 + length > bytes.byteLength) break;
    frames.push({ marker, start: at, bytes: 2 + length });
    at += 2 + length;
  }
  return frames;
}

export function payloadOf(frame: Frame): number {
  return frame.bytes - 4;
}

export function countOf(frames: readonly Frame[], marker: number): number {
  return frames.filter((frame) => frame.marker === marker).length;
}

// --- the tests this file owns -------------------------------------------------

function jpeg(markers: readonly number[]): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  // A segment is two marker bytes, two length bytes, and the payload the length counts.
  for (const marker of markers) parts.push(0xff, marker, 0x00, 0x08, 1, 2, 3, 4, 5, 6);
  return new Uint8Array(parts);
}

export const checks: readonly Check[] = [
  {
    name: "a jpeg's first frame is the one after the start of image",
    run: () => eq(walk(jpeg([0xe0]))[0]?.marker, 0xe0, "marker"),
  },
  {
    name: "a buffer that does not start with ffd8 has no frames",
    run: () => eq(walk(new Uint8Array([1, 2, 3])).length, 0, "frames"),
  },
  {
    name: "the payload is the frame minus its four header bytes",
    run: () => {
      const frame = walk(jpeg([0xe1]))[0];
      if (!frame) throw new Error("no frame");
      return eq(payloadOf(frame), frame.bytes - 4, "payload");
    },
  },
  {
    name: "counting a marker counts only that marker",
    run: () => {
      const frames = walk(jpeg([0xe0, 0xe1, 0xe1]));
      eq(countOf(frames, 0xe1), 2, "app1");
      return eq(countOf(frames, 0xe0), 1, "app0");
    },
  },
  {
    name: "a truncated frame stops the walk",
    run: () => {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0xff, 0x00]);
      return eq(walk(bytes).length, 0, "frames");
    },
  },
];
