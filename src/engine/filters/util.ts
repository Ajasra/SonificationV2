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
