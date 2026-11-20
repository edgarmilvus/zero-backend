/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * Byte ranges as values: split a size, count what a list covers, and ask whether two overlap. No
 * reader, no buffer, no file.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Range = { readonly from: number; readonly to: number };

export function newRange(from: number, to: number): Range {
  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error(`range: ${from}..${to} is not whole bytes`);
  if (from < 0 || to < from) throw new Error(`range: ${from}..${to} is not a range`);
  return { from, to };
}

export function split(size: number, chunk: number): readonly Range[] {
  if (!Number.isInteger(chunk) || chunk < 1) throw new Error(`chunk: expected a positive integer, got ${chunk}`);
  const out: Range[] = [];
  for (let from = 0; from < size; from += chunk) out.push(newRange(from, Math.min(from + chunk, size)));
  return out;
}

export function lengthOf(range: Range): number {
  return range.to - range.from;
}

export function overlaps(left: Range, right: Range): boolean {
  return left.from < right.to && right.from < left.to;
}

// --- the tests this file owns -------------------------------------------------

const RANGES = split(1000, 300);

export const checks: readonly Check[] = [
  {
    name: "a split covers the size exactly",
    run: () => eq(RANGES.reduce((sum, range) => sum + lengthOf(range), 0), 1000, "covered"),
  },
  {
    name: "the last range is the remainder",
    run: () => eq(lengthOf(RANGES.at(-1) ?? newRange(0, 0)), 100, "last"),
  },
  {
    name: "consecutive ranges do not overlap",
    run: () => {
      for (let index = 1; index < RANGES.length; index += 1) {
        if (overlaps(RANGES[index]!, RANGES[index - 1]!)) return false;
      }
      return true;
    },
  },
  {
    name: "an inverted range is refused",
    run: () => {
      try {
        newRange(10, 5);
        return false;
      } catch (error) {
        return expect((error as Error).message.includes("not a range"), "message");
      }
    },
  },
  {
    name: "a zero chunk is refused",
    run: () => {
      try {
        split(100, 0);
        return false;
      } catch (error) {
        return expect((error as Error).message.includes("positive"), "message");
      }
    },
  },
];
