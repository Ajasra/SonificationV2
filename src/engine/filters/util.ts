// Shared math helpers for DSP filter modules
export const TWO_PI = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Fast rational approximation of tanh for inner audio saturation loops
export function fastTanh(x: number): number {
  if (x < -3.0) return -1.0;
  if (x > 3.0) return 1.0;
  const x2 = x * x;
  return (x * (27.0 + x2)) / (27.0 + 9.0 * x2);
}

// 8192-point precomputed sine table for inner DSP/LFO loops (max error < 0.0004)
export const SIN_TABLE_SIZE = 8192;
export const SIN_TABLE_MASK = 8191;
export const SIN_TABLE = new Float32Array(SIN_TABLE_SIZE);
for (let i = 0; i < SIN_TABLE_SIZE; i++) {
  SIN_TABLE[i] = Math.sin((i / SIN_TABLE_SIZE) * TWO_PI);
}
export const RAD_TO_SIN_IDX = SIN_TABLE_SIZE / TWO_PI;

export function fastSin(rad: number): number {
  return SIN_TABLE[((rad * RAD_TO_SIN_IDX) | 0) & SIN_TABLE_MASK];
}
