/**
 * Exercise 3 - the file that doubled.
 *
 * Base64 is a third larger, and an export that base64-encodes its JSON and then escapes it pays twice.
 * The arithmetic decides whether the archive is embedded or fetched, and at a thousand notes it is
 * nineteen kilobytes of difference per hundred.
 */

import { eq, expect, near, throws, type Check } from "./selfcheck.ts";

export function base64Bytes(bytes: number): number {
  if (!(bytes >= 0)) throw new Error(`bytes: ${bytes} is not a size`);
  return Math.ceil(bytes / 3) * 4;
}

export function archiveBytes(notes: number, perNote: number, reader: number): number {
  if (!Number.isInteger(notes) || notes < 0) throw new Error(`notes: ${notes} is not a count`);
  if (!(perNote > 0) || !(reader > 0)) throw new Error("archiveBytes: sizes must be positive");
  return notes * perNote + reader;
}

export function overhead(plain: number): number {
  return base64Bytes(plain) - plain;
}

export const checks: readonly Check[] = [
  { name: "three bytes become four", run: () => eq(base64Bytes(3), 4, "bytes") },
  { name: "one byte becomes four", run: () => eq(base64Bytes(1), 4, "bytes") },
  { name: "zero is zero", run: () => eq(base64Bytes(0), 0, "bytes") },
  { name: "a thousand bytes become 1,336", run: () => eq(base64Bytes(1_000), 1_336, "bytes") },
  { name: "the overhead is a third of the result", run: () => near(overhead(1_000) / base64Bytes(1_000), 0.25, 0.01, "share") },
  { name: "a hundred notes at 200 bytes plus a 2 kB reader", run: () => eq(archiveBytes(100, 200, 2_000), 22_000, "bytes") },
  { name: "a thousand notes", run: () => eq(archiveBytes(1_000, 200, 2_000), 202_000, "bytes") },
  { name: "the reader is a constant, the notes are the line", run: () => eq(archiveBytes(2_000, 200, 2_000) - archiveBytes(1_000, 200, 2_000), 200_000, "delta") },
  { name: "a negative size is refused", run: () => {
    const error = throws(() => base64Bytes(-1), "negative");
    return expect(error.message.includes("size"), error.message);
  } },
  { name: "a non-integer note count is refused", run: () => {
    const error = throws(() => archiveBytes(1.5, 10, 10), "count");
    return expect(error.message.includes("count"), error.message);
  } },
];

export function main(): number {
  console.log(`1,000 notes       ${(archiveBytes(1_000, 200, 2_000) / 1024).toFixed(0)} kB plain, ${(base64Bytes(archiveBytes(1_000, 200, 2_000)) / 1024).toFixed(0)} kB base64`);
  console.log(`overhead          ${(overhead(archiveBytes(1_000, 200, 2_000)) / 1024).toFixed(0)} kB, a third of the file`);
  console.log("");
  console.log("embed the JSON; base64 is for bytes that are not already text");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
