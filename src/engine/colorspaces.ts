// Ultra-Fast In-Place Color Space Conversions with Complete LUTs and Inlined Math
import type { ColorSpace } from '../types/index.ts';
import { LUT_CORRECTION_XYZ, LUT_CBRT_4096, LUT_REC_XYZ_4096 } from './fast-lut.ts';

const D65FX_4 = 4.0 * 0.950456 / (0.950456 + 15.0 * 1.0 + 3.0 * 1.088754);
const D65FY_9 = 9.0 * 1.0 / (0.950456 + 15.0 * 1.0 + 3.0 * 1.088754);
const RANGE_X = 100.0 * (0.4124 + 0.3576 + 0.1805);
const RANGE_Y = 100.0;
const RANGE_Z = 100.0 * (0.0193 + 0.1192 + 0.9505);
const CIEEpsilon = 216.0 / 24389.0;
const CIEK = 24389.0 / 27.0;
const CIEK2epsilon = CIEK * CIEEpsilon;
const mepsilon = 1.0e-10;
const One_Third = 1.0 / 3.0;

function perceptibleReciprocal(x: number): number {
  const sgn = x < 0.0 ? -1.0 : 1.0;
  if (sgn * x >= mepsilon) return 1.0 / x;
  return sgn / mepsilon;
}

export function convertToColorSpace(data: Uint8ClampedArray, cs: ColorSpace): void {
  if (cs === 'RGB') return;
  const len = data.length;

  switch (cs) {
    case 'CMY': {
      for (let i = 0; i < len; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      break;
    }
    case 'OHTA': {
      for (let i = 0; i < len; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const v0 = 0.33333 * r + 0.33334 * g + 0.33333 * b;
        const v1 = 0.5 * r - 0.5 * b + 127.5;
        const v2 = -0.25 * r + 0.5 * g - 0.25 * b + 127.5;
        data[i] = v0 < 0 ? 0 : v0 > 255 ? 255 : (v0 | 0);
        data[i + 1] = v1 < 0 ? 0 : v1 > 255 ? 255 : (v1 | 0);
        data[i + 2] = v2 < 0 ? 0 : v2 > 255 ? 255 : (v2 | 0);
      }
      break;
    }
    case 'XYZ': {
      const invX = 255.0 / RANGE_X;
      const invY = 255.0 / RANGE_Y;
      const invZ = 255.0 / RANGE_Z;
      for (let i = 0; i < len; i += 4) {
        const cr = LUT_CORRECTION_XYZ[data[i]];
        const cg = LUT_CORRECTION_XYZ[data[i + 1]];
        const cb = LUT_CORRECTION_XYZ[data[i + 2]];
        const x = (cr * 0.4124 + cg * 0.3576 + cb * 0.1805) * invX;
        const y = (cr * 0.2126 + cg * 0.7152 + cb * 0.0722) * invY;
        const z = (cr * 0.0193 + cg * 0.1192 + cb * 0.9505) * invZ;
        data[i] = x < 0 ? 0 : x > 255 ? 255 : (x | 0);
        data[i + 1] = y < 0 ? 0 : y > 255 ? 255 : (y | 0);
        data[i + 2] = z < 0 ? 0 : z > 255 ? 255 : (z | 0);
      }
      break;
    }
    case 'YXY': {
      const invY = 255.0 / RANGE_Y;
      for (let i = 0; i < len; i += 4) {
        const cr = LUT_CORRECTION_XYZ[data[i]];
        const cg = LUT_CORRECTION_XYZ[data[i + 1]];
        const cb = LUT_CORRECTION_XYZ[data[i + 2]];
        const xVal = cr * 0.4124 + cg * 0.3576 + cb * 0.1805;
        const yVal = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
        const zVal = cr * 0.0193 + cg * 0.1192 + cb * 0.9505;
        const sum = xVal + yVal + zVal;
        const invSum = sum > 0 ? 255.0 / sum : 0;
        const yByte = yVal * invY;
        const xByte = xVal * invSum;
        const yNormByte = yVal * invSum;
        data[i] = yByte < 0 ? 0 : yByte > 255 ? 255 : (yByte | 0);
        data[i + 1] = xByte < 0 ? 0 : xByte > 255 ? 255 : (xByte | 0);
        data[i + 2] = yNormByte < 0 ? 0 : yNormByte > 255 ? 255 : (yNormByte | 0);
      }
      break;
    }
    case 'HCL': {
      for (let i = 0; i < len; i += 4) {
        const nr = data[i] * 0.0039215686;
        const ng = data[i + 1] * 0.0039215686;
        const nb = data[i + 2] * 0.0039215686;
        const mx = nr > ng ? (nr > nb ? nr : nb) : (ng > nb ? ng : nb);
        const mn = nr < ng ? (nr < nb ? nr : nb) : (ng < nb ? ng : nb);
        const chr = mx - mn;
        let h = 0.0;
        if (chr !== 0) {
          if (nr === mx) {
            h = ((ng - nb) / chr + 6.0) % 6.0;
          } else if (ng === mx) {
            h = (nb - nr) / chr + 2.0;
          } else {
            h = (nr - ng) / chr + 4.0;
          }
        }
        const v0 = h * 42.5;
        const v1 = chr * 255.0;
        const v2 = 255.0 * (0.298839 * nr + 0.586811 * ng + 0.11435 * nb);
        data[i] = v0 < 0 ? 0 : v0 > 255 ? 255 : (v0 | 0);
        data[i + 1] = v1 < 0 ? 0 : v1 > 255 ? 255 : (v1 | 0);
        data[i + 2] = v2 < 0 ? 0 : v2 > 255 ? 255 : (v2 | 0);
      }
      break;
    }
    case 'LAB': {
      for (let i = 0; i < len; i += 4) {
        const cr = LUT_CORRECTION_XYZ[data[i]];
        const cg = LUT_CORRECTION_XYZ[data[i + 1]];
        const cb = LUT_CORRECTION_XYZ[data[i + 2]];
        const xVal = (cr * 0.4124 + cg * 0.3576 + cb * 0.1805) * 0.010521268;
        const yVal = (cr * 0.2126 + cg * 0.7152 + cb * 0.0722) * 0.01;
        const zVal = (cr * 0.0193 + cg * 0.1192 + cb * 0.9505) * 0.009184811;

        let fx: number;
        if (xVal > CIEEpsilon) {
          const idx = (xVal * 3276.0) | 0;
          fx = idx < 4096 ? LUT_CBRT_4096[idx] : Math.cbrt(xVal);
        } else {
          fx = (CIEK * xVal + 16.0) * 0.008620689;
        }

        let fy: number;
        if (yVal > CIEEpsilon) {
          const idx = (yVal * 3276.0) | 0;
          fy = idx < 4096 ? LUT_CBRT_4096[idx] : Math.cbrt(yVal);
        } else {
          fy = (CIEK * yVal + 16.0) * 0.008620689;
        }

        let fz: number;
        if (zVal > CIEEpsilon) {
          const idx = (zVal * 3276.0) | 0;
          fz = idx < 4096 ? LUT_CBRT_4096[idx] : Math.cbrt(zVal);
        } else {
          fz = (CIEK * zVal + 16.0) * 0.008620689;
        }

        const v0 = 255.0 * ((116.0 * fy - 16.0) * 0.01);
        const v1 = 255.0 * (0.5 * (fx - fy) + 0.5);
        const v2 = 255.0 * (0.5 * (fy - fz) + 0.5);
        data[i] = v0 < 0 ? 0 : v0 > 255 ? 255 : (v0 | 0);
        data[i + 1] = v1 < 0 ? 0 : v1 > 255 ? 255 : (v1 | 0);
        data[i + 2] = v2 < 0 ? 0 : v2 > 255 ? 255 : (v2 | 0);
      }
      break;
    }
    case 'LUV': {
      for (let i = 0; i < len; i += 4) {
        const cr = LUT_CORRECTION_XYZ[data[i]];
        const cg = LUT_CORRECTION_XYZ[data[i + 1]];
        const cb = LUT_CORRECTION_XYZ[data[i + 2]];
        const xVal = (cr * 0.4124 + cg * 0.3576 + cb * 0.1805) * 0.01;
        const yVal = (cr * 0.2126 + cg * 0.7152 + cb * 0.0722) * 0.01;
        const zVal = (cr * 0.0193 + cg * 0.1192 + cb * 0.9505) * 0.01;

        let cbrtY = 0;
        if (yVal > CIEEpsilon) {
          const idx = (yVal * 3276.0) | 0;
          cbrtY = idx < 4096 ? LUT_CBRT_4096[idx] : Math.cbrt(yVal);
        }
        let L = yVal > CIEEpsilon ? 116.0 * cbrtY - 16.0 : CIEK * yVal;
        const alpha = perceptibleReciprocal(xVal + 15.0 * yVal + 3.0 * zVal);
        const L13 = 13.0 * L;
        let u = L13 * (4.0 * alpha * xVal - D65FX_4);
        let v = L13 * (9.0 * alpha * yVal - D65FY_9);
        L *= 0.01;
        u = (u + 134.0) / 354.0;
        v = (v + 140.0) / 262.0;

        const v0 = L * 255;
        const v1 = u * 255;
        const v2 = v * 255;
        data[i] = v0 < 0 ? 0 : v0 > 255 ? 255 : (v0 | 0);
        data[i + 1] = v1 < 0 ? 0 : v1 > 255 ? 255 : (v1 | 0);
        data[i + 2] = v2 < 0 ? 0 : v2 > 255 ? 255 : (v2 | 0);
      }
      break;
    }
  }
}

export function convertFromColorSpace(data: Uint8ClampedArray, cs: ColorSpace): void {
  if (cs === 'RGB') return;
  const len = data.length;

  switch (cs) {
    case 'CMY': {
      for (let i = 0; i < len; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      break;
    }
    case 'OHTA': {
      for (let i = 0; i < len; i += 4) {
        const I1 = data[i];
        const I2 = data[i + 1] - 127.5;
        const I3 = data[i + 2] - 127.5;
        const v0 = I1 + 1.0 * I2 - 0.66668 * I3;
        const v1 = I1 + 1.33333 * I3;
        const v2 = I1 - 1.0 * I2 - 0.66668 * I3;
        data[i] = v0 < 0 ? 0 : v0 > 255 ? 255 : (v0 | 0);
        data[i + 1] = v1 < 0 ? 0 : v1 > 255 ? 255 : (v1 | 0);
        data[i + 2] = v2 < 0 ? 0 : v2 > 255 ? 255 : (v2 | 0);
      }
      break;
    }
    case 'XYZ': {
      const inv = 1.0 / 255.0;
      const sX = (RANGE_X * 0.01) * inv;
      const sY = (RANGE_Y * 0.01) * inv;
      const sZ = (RANGE_Z * 0.01) * inv;
      for (let i = 0; i < len; i += 4) {
        const x = data[i] * sX;
        const y = data[i + 1] * sY;
        const z = data[i + 2] * sZ;
        const rN = x * 3.2406 + y * -1.5372 + z * -0.4986;
        const gN = x * -0.9689 + y * 1.8758 + z * 0.0415;
        const bN = x * 0.0557 + y * -0.204 + z * 1.057;
        const rI = (rN * 2730.0) | 0;
        const gI = (gN * 2730.0) | 0;
        const bI = (bN * 2730.0) | 0;
        data[i] = rI <= 0 ? 0 : rI < 4096 ? LUT_REC_XYZ_4096[rI] : 255;
        data[i + 1] = gI <= 0 ? 0 : gI < 4096 ? LUT_REC_XYZ_4096[gI] : 255;
        data[i + 2] = bI <= 0 ? 0 : bI < 4096 ? LUT_REC_XYZ_4096[bI] : 255;
      }
      break;
    }
    case 'YXY': {
      const inv255 = 1.0 / 255.0;
      for (let i = 0; i < len; i += 4) {
        const Y = data[i] * (RANGE_Y * inv255);
        const x = data[i + 1] * inv255;
        const y = data[i + 2] * inv255;
        const divy = Y / (y > 0 ? y : 1.0e-6);
        const xN = (x * divy) * 0.01;
        const yN = Y * 0.01;
        const zN = ((1.0 - x - y) * divy) * 0.01;
        const rN = xN * 3.2406 + yN * -1.5372 + zN * -0.4986;
        const gN = xN * -0.9689 + yN * 1.8758 + zN * 0.0415;
        const bN = xN * 0.0557 + yN * -0.204 + zN * 1.057;
        const rI = (rN * 2730.0) | 0;
        const gI = (gN * 2730.0) | 0;
        const bI = (bN * 2730.0) | 0;
        data[i] = rI <= 0 ? 0 : rI < 4096 ? LUT_REC_XYZ_4096[rI] : 255;
        data[i + 1] = gI <= 0 ? 0 : gI < 4096 ? LUT_REC_XYZ_4096[gI] : 255;
        data[i + 2] = bI <= 0 ? 0 : bI < 4096 ? LUT_REC_XYZ_4096[bI] : 255;
      }
      break;
    }
    case 'HCL': {
      const inv255 = 1.0 / 255.0;
      for (let i = 0; i < len; i += 4) {
        const h = data[i] * (6.0 * inv255);
        const chr = data[i + 1] * inv255;
        const l = data[i + 2] * inv255;
        const x = chr * (1.0 - Math.abs((h % 2.0) - 1.0));
        let r = 0, g = 0, b = 0;
        if (h < 1.0) { r = chr; g = x; }
        else if (h < 2.0) { r = x; g = chr; }
        else if (h < 3.0) { g = chr; b = x; }
        else if (h < 4.0) { g = x; b = chr; }
        else if (h < 5.0) { r = x; b = chr; }
        else { r = chr; b = x; }

        const m = l - (0.298839 * r + 0.586811 * g + 0.11435 * b);
        const v0 = 255.0 * (r + m);
        const v1 = 255.0 * (g + m);
        const v2 = 255.0 * (b + m);
        data[i] = v0 < 0 ? 0 : v0 > 255 ? 255 : (v0 | 0);
        data[i + 1] = v1 < 0 ? 0 : v1 > 255 ? 255 : (v1 | 0);
        data[i + 2] = v2 < 0 ? 0 : v2 > 255 ? 255 : (v2 | 0);
      }
      break;
    }
    case 'LAB': {
      const inv255 = 1.0 / 255.0;
      for (let i = 0; i < len; i += 4) {
        const nc0 = data[i] * inv255;
        const nc1 = data[i + 1] * inv255;
        const nc2 = data[i + 2] * inv255;

        const L = 100.0 * nc0;
        const a = nc1 - 0.5;
        const b = nc2 - 0.5;

        const y = (L + 16.0) * (1.0 / 116.0);
        const x = y + a;
        const z = y - b;

        const xxx = x * x * x;
        const fx = xxx > CIEEpsilon ? xxx : (116.0 * x - 16.0) / CIEK;
        const yyy = y * y * y;
        const fy = yyy > CIEEpsilon ? yyy : L / CIEK;
        const zzz = z * z * z;
        const fz = zzz > CIEEpsilon ? zzz : (116.0 * z - 16.0) / CIEK;

        const xN = (RANGE_X * fx) * 0.01;
        const yN = (RANGE_Y * fy) * 0.01;
        const zN = (RANGE_Z * fz) * 0.01;

        const rN = xN * 3.2406 + yN * -1.5372 + zN * -0.4986;
        const gN = xN * -0.9689 + yN * 1.8758 + zN * 0.0415;
        const bN = xN * 0.0557 + yN * -0.204 + zN * 1.057;

        const rI = (rN * 2730.0) | 0;
        const gI = (gN * 2730.0) | 0;
        const bI = (bN * 2730.0) | 0;

        data[i] = rI <= 0 ? 0 : rI < 4096 ? LUT_REC_XYZ_4096[rI] : 255;
        data[i + 1] = gI <= 0 ? 0 : gI < 4096 ? LUT_REC_XYZ_4096[gI] : 255;
        data[i + 2] = bI <= 0 ? 0 : bI < 4096 ? LUT_REC_XYZ_4096[bI] : 255;
      }
      break;
    }
    case 'LUV': {
      const inv255 = 1.0 / 255.0;
      for (let i = 0; i < len; i += 4) {
        const L = 100.0 * (data[i] * inv255);
        const u = 354.0 * (data[i + 1] * inv255) - 134.0;
        const v = 262.0 * (data[i + 2] * inv255) - 140.0;

        const yArg = (L + 16.0) * (1.0 / 116.0);
        const Y = L > CIEK2epsilon ? yArg * yArg * yArg : L / CIEK;
        const L13 = 13.0 * L;
        const L52 = 52.0 * L;
        const Y5 = 5.0 * Y;
        const L13u = L52 / (u + L13 * D65FX_4);
        const X = (Y * ((39.0 * L) / (v + L13 * D65FY_9) - 5.0) + Y5) / (((L13u - 1.0) / 3.0) + One_Third);
        const Z = X * ((L13u - 1.0) / 3.0) - Y5;

        const rN = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
        const gN = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
        const bN = X * 0.0557 + Y * -0.204 + Z * 1.057;

        const rI = (rN * 2730.0) | 0;
        const gI = (gN * 2730.0) | 0;
        const bI = (bN * 2730.0) | 0;

        data[i] = rI <= 0 ? 0 : rI < 4096 ? LUT_REC_XYZ_4096[rI] : 255;
        data[i + 1] = gI <= 0 ? 0 : gI < 4096 ? LUT_REC_XYZ_4096[gI] : 255;
        data[i + 2] = bI <= 0 ? 0 : bI < 4096 ? LUT_REC_XYZ_4096[bI] : 255;
      }
      break;
    }
  }
}
