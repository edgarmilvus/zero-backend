/**
 * The two numbers a pool is judged by: the longest wait and the throughput.
 */

export function percentile(values: readonly number[], share: number): number {
  if (values.length === 0) return 0;
  if (!(share > 0 && share <= 1)) throw new Error(`percentile: ${share} is not a share`);
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(share * sorted.length) - 1));
  return sorted[index] as number;
}

export function throughput(count: number, ms: number): number {
  if (!(ms > 0)) return 0;
  return (count / ms) * 1000;
}

export type Summary = {
  readonly count: number;
  readonly totalMs: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
};

export function summarize(values: readonly number[]): Summary {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    totalMs: total,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length === 0 ? 0 : Math.max(...values),
  };
}
