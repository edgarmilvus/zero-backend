/**
 * The budget: bytes in, a verdict out.
 *
 * The floppy is 1,474,560 bytes and the chapter uses 100,000, because a budget that is the size of the
 * medium only tells you when it is too late. A fifth of the floppy leaves room for the data.
 */

export const FLOPPY_BYTES = 1_474_560;
export const BUDGET_BYTES = 100_000;

export function bytesOf(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function fits(bytes: number, budget = BUDGET_BYTES): boolean {
  if (!Number.isInteger(bytes) || bytes < 0) throw new Error(`bytes: ${bytes} is not a size`);
  if (!Number.isInteger(budget) || budget <= 0) throw new Error(`budget: ${budget} is not a budget`);
  return bytes <= budget;
}

export function share(bytes: number, budget = BUDGET_BYTES): number {
  if (!(budget > 0)) throw new Error(`budget: ${budget} is not a budget`);
  return bytes / budget;
}

export function total(parts: readonly { name: string; bytes: number }[]): number {
  for (const part of parts) {
    if (!Number.isInteger(part.bytes) || part.bytes < 0) throw new Error(`${part.name}: ${part.bytes} is not a size`);
  }
  return parts.reduce((sum, part) => sum + part.bytes, 0);
}
