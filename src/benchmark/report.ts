export function summarize(samples: readonly number[]): { count: number; p50: number | null; p95: number | null; p99: number | null } {
  if (samples.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid timing sample');
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number): number | null => sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : null;
  return { count: sorted.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) };
}
