/**
 * Chunking: a note longer than a model's window has to become several vectors.
 *
 * The model's limit is 256 tokens, which is a paragraph and not a page. Embedding a five-thousand-word
 * note whole produces one vector that is the average of everything in it, and an average is a point
 * near nothing: it matches no question in particular and ranks mid-table for all of them.
 */

export const CHUNK_WORDS = 60;
export const CHUNK_OVERLAP = 15;

export type ChunkOptions = {
  readonly words?: number;
  readonly overlap?: number;
};

/**
 * Splits on word boundaries, with an overlap so a sentence at the seam survives in one of the chunks.
 *
 * Word boundaries rather than characters: a chunk that ends mid-word embeds a token no reader wrote,
 * and a chunk that ends mid-sentence embeds a clause without its subject.
 */
export function chunk(text: string, options: ChunkOptions = {}): string[] {
  const size = options.words ?? CHUNK_WORDS;
  const overlap = options.overlap ?? CHUNK_OVERLAP;

  if (!Number.isInteger(size) || size <= 0) throw new Error(`chunk: words must be a positive integer, got ${size}`);
  if (!Number.isInteger(overlap) || overlap < 0) throw new Error(`chunk: overlap must be a non-negative integer, got ${overlap}`);
  if (overlap >= size) throw new Error(`chunk: overlap ${overlap} must be smaller than the chunk ${size}`);

  const trimmed = text.trim();
  if (trimmed === "") throw new Error("chunk: an empty text has no chunks");

  const words = trimmed.split(/\s+/);
  if (words.length <= size) return [trimmed];

  const step = size - overlap;
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + size);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
    if (start + size >= words.length) break;
  }
  return chunks;
}

/** How many vectors a text becomes, without building them: the number a budget is written in. */
export function chunkCount(text: string, options: ChunkOptions = {}): number {
  return chunk(text, options).length;
}
