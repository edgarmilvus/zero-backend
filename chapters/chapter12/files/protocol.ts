/**
 * The worker protocol, as a parser and a shape.
 *
 * A `postMessage` boundary is untyped by construction: the worker receives whatever the page sent, and
 * a message that is almost right produces a model call with an empty list or a string where a vector
 * was expected. The parser is the boundary's type system, and it is a pure function.
 */

export const MAX_BATCH = 32;
export const MAX_CHARS = 4_000;

export type Request =
  | { readonly type: "warm" }
  | { readonly type: "embed"; readonly id: number; readonly texts: readonly string[] };

export function parseRequest(raw: unknown): Request {
  if (typeof raw !== "object" || raw === null) throw new Error("message: expected an object");
  const message = raw as Record<string, unknown>;

  if (message.type === "warm") return { type: "warm" };
  if (message.type !== "embed") throw new Error(`message.type: unknown ${String(message.type)}`);

  const id = message.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
    throw new Error(`message.id: expected a positive integer, got ${String(id)}`);
  }
  if (!Array.isArray(message.texts) || message.texts.length === 0) {
    throw new Error("message.texts: expected at least one text");
  }
  if (message.texts.length > MAX_BATCH) {
    throw new Error(`message.texts: ${message.texts.length} texts, the worker takes at most ${MAX_BATCH}`);
  }

  let characters = 0;
  for (const [index, text] of message.texts.entries()) {
    if (typeof text !== "string") throw new Error(`message.texts[${index}]: expected a string`);
    if (text.trim() === "") throw new Error(`message.texts[${index}]: an empty text has no embedding`);
    characters += text.length;
  }
  if (characters > MAX_CHARS) {
    throw new Error(`message.texts: ${characters} characters, the worker takes at most ${MAX_CHARS}`);
  }

  // A copy, so a caller that mutates its array after posting cannot change the request it sent.
  return { type: "embed", id, texts: [...(message.texts as string[])] };
}

/** What a result costs on the wire, before anything is transferred. */
export function resultBytes(count: number, dims: number): number {
  if (!Number.isInteger(count) || count <= 0) throw new Error(`count: ${count} is not a batch size`);
  if (!Number.isInteger(dims) || dims <= 0) throw new Error(`dims: ${dims} is not a dimension count`);
  return count * dims * 4;
}

/** A result the page can trust: one vector per text, and every vector the declared width. */
export function assertResult(texts: number, vectors: readonly Float32Array[], dims: number): void {
  if (vectors.length !== texts) {
    throw new Error(`result: ${vectors.length} vectors for ${texts} texts`);
  }
  for (const [index, vector] of vectors.entries()) {
    if (vector.length !== dims) {
      throw new Error(`result: vector ${index} has ${vector.length} dimensions, expected ${dims}`);
    }
  }
}
