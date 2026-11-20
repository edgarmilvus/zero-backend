/**
 * Exercise 3 - the recall you did not measure.
 *
 * float32 to int8 is four times smaller and almost always returns the same five notes. "Almost" is a
 * number, and the exercise computes it: the overlap between the exact top-k and the approximate one,
 * over a corpus that is large enough to move.
 */

import { eq, expect, near, throws, type Check } from "./selfcheck.ts";

export type Scored = { readonly id: string; readonly score: number };

export function topK(rows: readonly Scored[], k: number): Scored[] {
  if (!Number.isInteger(k) || k < 0) throw new Error(`k: ${k} is not a non-negative integer`);
  return [...rows].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
}

/** The share of the exact top-k that the approximate top-k also contains, averaged over queries. */
export function recallAt(exact: readonly (readonly Scored[])[], approximate: readonly (readonly Scored[])[], k: number): number {
  if (exact.length !== approximate.length) throw new Error(`recall: ${exact.length} and ${approximate.length} result sets`);
  if (exact.length === 0) return 1;
  let hits = 0;
  let total = 0;
  for (const [index, golden] of exact.entries()) {
    const ids = new Set(golden.slice(0, k).map((row) => row.id));
    hits += (approximate[index] ?? []).slice(0, k).filter((row) => ids.has(row.id)).length;
    total += Math.min(k, golden.length);
  }
  return total === 0 ? 1 : hits / total;
}

/** Bytes for `count` vectors of `dims` dimensions in the given representation. */
export function bytesOf(count: number, dims: number, kind: "float32" | "int8"): number {
  if (!Number.isInteger(count) || count < 0) throw new Error(`count: ${count} is not a vector count`);
  if (!Number.isInteger(dims) || dims <= 0) throw new Error(`dims: ${dims} is not a dimension count`);
  return count * dims * (kind === "float32" ? 4 : 1);
}

/** One scale per vector, the byte, and the inverse: the whole of the representation. */
export function quantize(vector: readonly number[]): { values: Int8Array; scale: number } {
  const maxAbs = vector.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (maxAbs === 0) return { values: new Int8Array(vector.length), scale: 0 };
  const scale = maxAbs / 127;
  const values = Int8Array.from(vector, (value) => Math.max(-127, Math.min(127, Math.round(value / scale))));
  return { values, scale };
}

export function dequantize(quantized: { values: Int8Array; scale: number }): number[] {
  return Array.from(quantized.values, (value) => value * quantized.scale);
}

const A: Scored[] = [{ id: "a", score: 0.9 }, { id: "b", score: 0.8 }, { id: "c", score: 0.7 }];

export const checks: readonly Check[] = [
  {
    name: "an approximation that changes nothing has a recall of one",
    run: () => eq(recallAt([A], [A], 3), 1, "recall"),
  },
  {
    name: "an approximation that returns other ids has a recall of zero",
    run: () => eq(recallAt([A], [[{ id: "x", score: 1 }, { id: "y", score: 1 }, { id: "z", score: 1 }]], 3), 0, "recall"),
  },
  {
    name: "half the ids shared is half the recall",
    run: () => eq(recallAt([A], [[{ id: "a", score: 1 }, { id: "x", score: 1 }, { id: "y", score: 1 }]], 3), 1 / 3, "recall"),
  },
  {
    name: "k limits what is compared",
    run: () => eq(recallAt([A], [[{ id: "a", score: 1 }, { id: "x", score: 1 }]], 1), 1, "recall"),
  },
  {
    name: "no queries is a recall of one, not a division by zero",
    run: () => eq(recallAt([], [], 5), 1, "recall"),
  },
  {
    name: "result sets of different sizes are refused",
    run: () => {
      const error = throws(() => recallAt([A], [], 3), "lengths");
      return expect(error.message.includes("result sets"), error.message);
    },
  },
  {
    name: "int8 is exactly a quarter of the bytes",
    run: () => eq(bytesOf(40, 384, "float32") / bytesOf(40, 384, "int8"), 4, "ratio"),
  },
  {
    name: "the largest component maps to 127",
    run: () => eq(quantize([0.5, -0.25, 0.125]).values[0], 127, "max"),
  },
  {
    name: "the negative of it maps to minus 127",
    run: () => eq(quantize([-0.5, 0.25, 0.125]).values[0], -127, "min"),
  },
  {
    name: "a round trip is within the step of the scale",
    run: () => {
      const vector = [0.5, -0.25, 0.125];
      const back = dequantize(quantize(vector));
      const step = 0.5 / 127;
      return expect(vector.every((value, index) => near(back[index] ?? 0, value, step, "component")), "round trip");
    },
  },
];

export function main(): number {
  console.log(`float32           ${bytesOf(40, 384, "float32")} bytes`);
  console.log(`int8              ${bytesOf(40, 384, "int8")} bytes`);
  console.log(`recall of one set ${recallAt([A], [A], 3)}`);
  console.log("");
  console.log("the smaller representation is a claim until the shared top-k is counted");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
