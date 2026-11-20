/**
 * The five functions a vector search is made of, and nothing else.
 *
 * Cosine is the one that matters: a dot product divided by the two lengths, which is the cosine of the
 * angle between the vectors and therefore a number in [-1, 1] that does not care how long they are.
 * A model that normalizes its output makes the division redundant, and a corpus that was never checked
 * makes it load-bearing.
 */

export type Scored = { readonly id: string; readonly score: number };

export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`dot: ${a.length} and ${b.length} dimensions`);
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += (a[index] as number) * (b[index] as number);
  return sum;
}

export function norm(a: Float32Array): number {
  return Math.sqrt(dot(a, a));
}

/** A copy, scaled to length one. A zero vector is returned unchanged: there is no direction to keep. */
export function normalize(a: Float32Array): Float32Array {
  const length = norm(a);
  if (length === 0) return new Float32Array(a);
  const out = new Float32Array(a.length);
  for (let index = 0; index < a.length; index += 1) out[index] = (a[index] as number) / length;
  return out;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const denominator = norm(a) * norm(b);
  if (denominator === 0) return 0;
  return dot(a, b) / denominator;
}

/**
 * The k highest scores, with the id as the tiebreak.
 *
 * The sort is total on purpose: two notes with the same score must come back in the same order on
 * every machine, or a test that compares a top-five compares a coin flip.
 */
export function topK(scored: readonly Scored[], k: number): Scored[] {
  if (!Number.isInteger(k) || k < 0) throw new Error(`k: ${k} is not a non-negative integer`);
  return [...scored].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
}
