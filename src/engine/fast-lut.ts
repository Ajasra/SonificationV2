// Fast Lookup Tables & Inlined Math for Sonification V2
// Precalculated tables to eliminate Math.pow, Math.cbrt, Math.log, Math.exp inside pixel loops

const A = 87.6;
const rA = 1.0 / A;
const lnA = 1.0 + Math.log(A);
const rlnA = 1.0 / lnA;
const U = 255.0;
const rU = 1.0 / 255.0;
const U1 = 1.0 + U;
const lnU = Math.log(U1);

// 1. Correction XYZ lookup table for 0..255 (sRGB -> Linear XYZ component)
export const LUT_CORRECTION_XYZ = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const n = i / 255.0;
  LUT_CORRECTION_XYZ[i] = (n > 0.04045 ? Math.pow((n + 0.055) / 1.055, 2.4) : n / 12.92) * 100.0;
}

// 2. Precomputed Cube Root table for LAB / LUV (x in [0, 1.25])
export const LUT_CBRT_4096 = new Float32Array(4096);
for (let i = 0; i < 4096; i++) {
  const val = (i / 4095.0) * 1.25;
  LUT_CBRT_4096[i] = Math.cbrt(val);
}

export function fastCbrt(x: number): number {
  if (x <= 0) return 0;
  const idx = (x * 3276.0) | 0; // 4095 / 1.25 = 3276.0
  return idx < 4096 ? LUT_CBRT_4096[idx] : Math.cbrt(x);
}

// 3. Precomputed XYZ -> sRGB transfer curve (linear 0..1.5 -> byte 0..255)
export const LUT_REC_XYZ_4096 = new Uint8Array(4096);
const corrratio = 1.0 / 2.4;
for (let i = 0; i < 4096; i++) {
  const n = (i / 4095.0) * 1.5;
  const linear = n > 0.0031308 ? 1.055 * Math.pow(n, corrratio) - 0.055 : 12.92 * n;
  LUT_REC_XYZ_4096[i] = Math.max(0, Math.min(255, (linear * 255.0) | 0));
}

export function fastRecorrectionByte(n: number): number {
  if (n <= 0) return 0;
  const idx = (n * 2730.0) | 0; // 4095 / 1.5 = 2730.0
  return idx < 4096 ? LUT_REC_XYZ_4096[idx] : 255;
}

// 4. A-Law and U-Law lookup tables for 8-bit unsigned bytes (0..255 -> float sample [-1..1])
export const LUT_ALAW_8 = new Float32Array(256);
export const LUT_ULAW_8 = new Float32Array(256);
export const LUT_LINEAR_8 = new Float32Array(256);

// Reverse law tables for 8-bit output (quantized from float -1..1 via 4096-entry LUT)
export const LUT_REV_ALAW_4096 = new Uint8Array(4096);
export const LUT_REV_ULAW_4096 = new Uint8Array(4096);

for (let i = 0; i < 256; i++) {
  const norm = 2.0 * (i / 255.0 - 0.5);
  LUT_LINEAR_8[i] = norm;

  // A-law
  const sgnA = norm < 0 ? -1.0 : 1.0;
  const absA = Math.abs(norm);
  LUT_ALAW_8[i] = absA < rA ? (sgnA * (A * absA)) / lnA : (sgnA * (1.0 + Math.log(A * absA))) / lnA;

  // U-law
  const sgnU = norm < 0 ? -1.0 : 1.0;
  LUT_ULAW_8[i] = (sgnU * Math.log(1.0 + U * Math.abs(norm))) / lnU;
}

for (let idx = 0; idx < 4096; idx++) {
  const sample = (idx / 4095.0) * 2.0 - 1.0; // [-1.0 .. 1.0]

  // Rev A-Law
  const sgnA = sample < 0 ? -1.0 : 1.0;
  const absA = Math.abs(sample);
  const revA = absA < rlnA ? (sgnA * (absA * lnA)) / A : (sgnA * Math.exp(absA * lnA - 1.0)) / A;
  LUT_REV_ALAW_4096[idx] = Math.max(0, Math.min(255, (255 * (0.5 * revA + 0.5)) | 0));

  // Rev U-Law
  const sgnU = sample < 0 ? -1.0 : 1.0;
  const revU = sgnU * rU * (Math.pow(U1, Math.abs(sample)) - 1.0);
  LUT_REV_ULAW_4096[idx] = Math.max(0, Math.min(255, (255 * (0.5 * revU + 0.5)) | 0));
}

// 5. Precalculated Sigmoid table for TapSigmoid (-8.0 .. 8.0)
export const LUT_SIGMOID_4096 = new Float32Array(4096);
for (let i = 0; i < 4096; i++) {
  const x = (i / 4095.0) * 16.0 - 8.0;
  LUT_SIGMOID_4096[i] = 2.0 / (1.0 + Math.exp(-x)) - 1.0;
}

export function fastSigmoid(x: number): number {
  if (x <= -8.0) return -1.0;
  if (x >= 8.0) return 1.0;
  const idx = ((x + 8.0) * 255.9375) | 0; // 4095 / 16.0 = 255.9375
  return LUT_SIGMOID_4096[idx];
}
