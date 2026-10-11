export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : (v | 0);
}

// Convert Hue (0..360), Saturation (0..1), Value (0..1) to RGB (0..255)
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;

  if (h < 60) {
    r = c; g = x; b = 0;
  } else if (h < 120) {
    r = x; g = c; b = 0;
  } else if (h < 180) {
    r = 0; g = c; b = x;
  } else if (h < 240) {
    r = 0; g = x; b = c;
  } else if (h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// 8192-point precomputed sine table for inner video/LFO loops (max error < 0.0004)
export const SIN_TABLE_SIZE = 8192;
export const SIN_TABLE_MASK = 8191;
export const SIN_TABLE = new Float32Array(SIN_TABLE_SIZE);
for (let i = 0; i < SIN_TABLE_SIZE; i++) {
  SIN_TABLE[i] = Math.sin((i / SIN_TABLE_SIZE) * Math.PI * 2);
}
export const RAD_TO_SIN_IDX = SIN_TABLE_SIZE / (Math.PI * 2);

export function fastSin(rad: number): number {
  return SIN_TABLE[((rad * RAD_TO_SIN_IDX) | 0) & SIN_TABLE_MASK];
}
