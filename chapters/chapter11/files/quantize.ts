/**
 * Quantization: 384 floats become 384 bytes, and the recall is the price.
 *
 * One scale per vector, because a vector's values share a range; int8 keeps the direction to about a
 * per cent and the direction is all cosine reads. The chapter measures the recall instead of arguing
 * about it: a top-five that changed is a search that answers a different question.
 */

import { cosine, type Scored } from "./vector.ts";

export type Quantized = {
  /** One signed byte per dimension. */
  readonly values: Int8Array;
  /** The factor that turns a byte back into a float; 0 for a vector that was all zeros. */
  readonly scale: number;
};

export function toInt8(vector: Float32Array): Quantized {
  let maxAbs = 0;
  for (const value of vector) maxAbs = Math.max(maxAbs, Math.abs(value));
  if (maxAbs === 0) return { values: new Int8Array(vector.length), scale: 0 };

  const scale = maxAbs / 127;
  const values = new Int8Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    values[index] = Math.max(-127, Math.min(127, Math.round((vector[index] as number) / scale)));
  }
  return { values, scale };
}

export function fromInt8(quantized: Quantized): Float32Array {
  const out = new Float32Array(quantized.values.length);
  for (let index = 0; index < quantized.values.length; index += 1) {
    out[index] = (quantized.values[index] as number) * quantized.scale;
  }
  return out;
}

/**
 * The integer dot product, which is the reason quantization is fast and not only small.
 *
 * Two int8 vectors of the same length multiply and add in the integers, and the two scales are applied
 * once at the end. A SIMD kernel does sixteen of these at a time; the loop here is the definition the
 * chapter's numbers are checked against.
 */
export function int8Cosine(a: Quantized, b: Quantized): number {
  if (a.values.length !== b.values.length) {
    throw new Error(`int8Cosine: ${a.values.length} and ${b.values.length} dimensions`);
  }
  let sum = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < a.values.length; index += 1) {
    const x = a.values[index] as number;
    const y = b.values[index] as number;
    sum += x * y;
    left += x * x;
    right += y * y;
  }
  if (left === 0 || right === 0) return 0;
  return sum / Math.sqrt(left * right);
}

/** Bytes a vector costs in each representation, for a corpus of `count` vectors. */
export function bytesOf(count: number, kind: "float32" | "int8"): number {
  if (!Number.isInteger(count) || count < 0) throw new Error(`count: ${count} is not a vector count`);
  if (kind === "float32") return count * 384 * 4;
  if (kind === "int8") return count * 384;
  throw new Error(`bytesOf: unknown representation ${kind}`);
}

/**
 * Recall@k between an exact ranking and an approximate one.
 *
 * For each query, the share of the exact top-k that the approximate top-k also contains. One means the
 * approximation changed nothing that a reader would see; zero means it returned a different five.
 */
export function recallAt(exact: readonly (readonly Scored[])[], approximate: readonly (readonly Scored[])[], k: number): number {
  if (exact.length !== approximate.length) throw new Error(`recall: ${exact.length} and ${approximate.length} result sets`);
  if (exact.length === 0) return 1;
  let hits = 0;
  let total = 0;
  for (const [index, golden] of exact.entries()) {
    const candidate = approximate[index] ?? [];
    const goldIds = new Set(golden.slice(0, k).map((row) => row.id));
    hits += candidate.slice(0, k).filter((row) => goldIds.has(row.id)).length;
    total += Math.min(k, golden.length);
  }
  return total === 0 ? 1 : hits / total;
}

/** The cosine between a float vector and a quantized one, used to show the error the bytes cost. */
export function quantizedSimilarity(a: Float32Array, b: Quantized): number {
  return cosine(a, fromInt8(b));
}
