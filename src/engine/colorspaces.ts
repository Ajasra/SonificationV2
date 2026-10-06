// Ultra-Fast In-Place Color Space Conversions with LUTs
import type { ColorSpace } from '../types/index.ts';
import { LUT_CORRECTION_XYZ, fastRecorrectionxyz } from './fast-lut.ts';

const D65X = 0.950456;
const D65Y = 1.0;
const D65Z = 1.088754;
const CIEEpsilon = 216.0 / 24389.0;
const CIEK = 24389.0 / 27.0;
const CIEK2epsilon = CIEK * CIEEpsilon;
const D65FX_4 = (4.0 * D65X) / (D65X + 15.0 * D65Y + 3.0 * D65Z);
const D65FY_9 = (9.0 * D65Y) / (D65X + 15.0 * D65Y + 3.0 * D65Z);
const RANGE_X = 100.0 * (0.4124 + 0.3576 + 0.1805);
const RANGE_Y = 100.0;
const RANGE_Z = 100.0 * (0.0193 + 0.1192 + 0.9505);
const mepsilon = 1.0e-10;
const One_Third = 1.0 / 3.0;

function clamp8(val: number): number {
  return val < 0 ? 0 : val > 255 ? 255 : (val | 0);
}

function perceptibleReciprocal(x: number): number {
  const sgn = x < 0.0 ? -1.0 : 1.0;
  if (sgn * x >= mepsilon) return 1.0 / x;
  return sgn / mepsilon;
}

export function convertToColorSpace(data: Uint8ClampedArray, cs: ColorSpace): void {
  if (cs === 'RGB') return;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    switch (cs) {
      case 'CMY': {
        data[i] = 255 - r;
        data[i + 1] = 255 - g;
        data[i + 2] = 255 - b;
        break;
      }
      case 'OHTA': {
        data[i] = clamp8(0.33333 * r + 0.33334 * g + 0.33333 * b);
        data[i + 1] = clamp8(0.5 * r - 0.5 * b + 127.5);
        data[i + 2] = clamp8(-0.25 * r + 0.5 * g - 0.25 * b + 127.5);
        break;
      }
      case 'XYZ': {
        const cr = LUT_CORRECTION_XYZ[r];
        const cg = LUT_CORRECTION_XYZ[g];
        const cb = LUT_CORRECTION_XYZ[b];
        const x = cr * 0.4124 + cg * 0.3576 + cb * 0.1805;
        const y = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
        const z = cr * 0.0193 + cg * 0.1192 + cb * 0.9505;
        data[i] = clamp8((x / RANGE_X) * 255);
        data[i + 1] = clamp8((y / RANGE_Y) * 255);
        data[i + 2] = clamp8((z / RANGE_Z) * 255);
        break;
      }
      case 'YXY': {
        const cr = LUT_CORRECTION_XYZ[r];
        const cg = LUT_CORRECTION_XYZ[g];
        const cb = LUT_CORRECTION_XYZ[b];
        const xVal = cr * 0.4124 + cg * 0.3576 + cb * 0.1805;
        const yVal = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
        const zVal = cr * 0.0193 + cg * 0.1192 + cb * 0.9505;
        const sum = xVal + yVal + zVal;
        const x = sum > 0 ? xVal / sum : 0;
        const y = sum > 0 ? yVal / sum : 0;
        data[i] = clamp8((yVal / RANGE_Y) * 255);
        data[i + 1] = clamp8(x * 255);
        data[i + 2] = clamp8(y * 255);
        break;
      }
      case 'HCL': {
        const nr = r * 0.003921568;
        const ng = g * 0.003921568;
        const nb = b * 0.003921568;
        const mx = Math.max(nr, Math.max(ng, nb));
        const mn = Math.min(nr, Math.min(ng, nb));
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
        data[i] = clamp8((h / 6.0) * 255);
        data[i + 1] = clamp8(chr * 255);
        data[i + 2] = clamp8(255 * (0.298839 * nr + 0.586811 * ng + 0.11435 * nb));
        break;
      }
      case 'LAB': {
        const cr = LUT_CORRECTION_XYZ[r];
        const cg = LUT_CORRECTION_XYZ[g];
        const cb = LUT_CORRECTION_XYZ[b];
        const xVal = (cr * 0.4124 + cg * 0.3576 + cb * 0.1805) * 0.010521268; // / (100 * D65X)
        const yVal = (cr * 0.2126 + cg * 0.7152 + cb * 0.0722) * 0.01; // / 100
        const zVal = (cr * 0.0193 + cg * 0.1192 + cb * 0.9505) * 0.009184811; // / (100 * D65Z)

        const fx = xVal > CIEEpsilon ? Math.cbrt(xVal) : (CIEK * xVal + 16.0) * 0.008620689;
        const fy = yVal > CIEEpsilon ? Math.cbrt(yVal) : (CIEK * yVal + 16.0) * 0.008620689;
        const fz = zVal > CIEEpsilon ? Math.cbrt(zVal) : (CIEK * zVal + 16.0) * 0.008620689;

        data[i] = clamp8(255.0 * ((116.0 * fy - 16.0) * 0.01));
        data[i + 1] = clamp8(255.0 * (0.5 * (fx - fy) + 0.5));
        data[i + 2] = clamp8(255.0 * (0.5 * (fy - fz) + 0.5));
        break;
      }
      case 'LUV': {
        const cr = LUT_CORRECTION_XYZ[r];
        const cg = LUT_CORRECTION_XYZ[g];
        const cb = LUT_CORRECTION_XYZ[b];
        const xVal = (cr * 0.4124 + cg * 0.3576 + cb * 0.1805) * 0.01;
        const yVal = (cr * 0.2126 + cg * 0.7152 + cb * 0.0722) * 0.01;
        const zVal = (cr * 0.0193 + cg * 0.1192 + cb * 0.9505) * 0.01;

        let L = yVal > CIEEpsilon ? 116.0 * Math.cbrt(yVal) - 16.0 : CIEK * yVal;
        const alpha = perceptibleReciprocal(xVal + 15.0 * yVal + 3.0 * zVal);
        const L13 = 13.0 * L;
        let u = L13 * (4.0 * alpha * xVal - D65FX_4);
        let v = L13 * (9.0 * alpha * yVal - D65FY_9);
        L *= 0.01;
        u = (u + 134.0) / 354.0;
        v = (v + 140.0) / 262.0;

        data[i] = clamp8(L * 255);
        data[i + 1] = clamp8(u * 255);
        data[i + 2] = clamp8(v * 255);
        break;
      }
    }
  }
}

export function convertFromColorSpace(data: Uint8ClampedArray, cs: ColorSpace): void {
  if (cs === 'RGB') return;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const c0 = data[i];
    const c1 = data[i + 1];
    const c2 = data[i + 2];

    switch (cs) {
      case 'CMY': {
        data[i] = 255 - c0;
        data[i + 1] = 255 - c1;
        data[i + 2] = 255 - c2;
        break;
      }
      case 'OHTA': {
        const I1 = c0;
        const I2 = c1 - 127.5;
        const I3 = c2 - 127.5;
        data[i] = clamp8(I1 + 1.0 * I2 - 0.66668 * I3);
        data[i + 1] = clamp8(I1 + 1.33333 * I3);
        data[i + 2] = clamp8(I1 - 1.0 * I2 - 0.66668 * I3);
        break;
      }
      case 'XYZ': {
        const x = (c0 / 255.0) * (RANGE_X / 100.0);
        const y = (c1 / 255.0) * (RANGE_Y / 100.0);
        const z = (c2 / 255.0) * (RANGE_Z / 100.0);
        data[i] = clamp8(255.0 * fastRecorrectionxyz(x * 3.2406 + y * -1.5372 + z * -0.4986));
        data[i + 1] = clamp8(255.0 * fastRecorrectionxyz(x * -0.9689 + y * 1.8758 + z * 0.0415));
        data[i + 2] = clamp8(255.0 * fastRecorrectionxyz(x * 0.0557 + y * -0.204 + z * 1.057));
        break;
      }
      case 'YXY': {
        const Y = (c0 / 255.0) * RANGE_Y;
        const x = c1 / 255.0;
        const y = c2 / 255.0;
        const divy = Y / (y > 0 ? y : 1.0e-6);
        const xN = (x * divy) * 0.01;
        const yN = Y * 0.01;
        const zN = ((1.0 - x - y) * divy) * 0.01;
        data[i] = clamp8(255.0 * fastRecorrectionxyz(xN * 3.2406 + yN * -1.5372 + zN * -0.4986));
        data[i + 1] = clamp8(255.0 * fastRecorrectionxyz(xN * -0.9689 + yN * 1.8758 + zN * 0.0415));
        data[i + 2] = clamp8(255.0 * fastRecorrectionxyz(xN * 0.0557 + yN * -0.204 + zN * 1.057));
        break;
      }
      case 'HCL': {
        const h = 6.0 * (c0 / 255.0);
        const chr = c1 / 255.0;
        const l = c2 / 255.0;
        const x = chr * (1.0 - Math.abs((h % 2.0) - 1.0));
        let r = 0, g = 0, b = 0;
        if (h < 1.0) { r = chr; g = x; }
        else if (h < 2.0) { r = x; g = chr; }
        else if (h < 3.0) { g = chr; b = x; }
        else if (h < 4.0) { g = x; b = chr; }
        else if (h < 5.0) { r = x; b = chr; }
        else { r = chr; b = x; }

        const m = l - (0.298839 * r + 0.586811 * g + 0.11435 * b);
        data[i] = clamp8(255 * (r + m));
        data[i + 1] = clamp8(255 * (g + m));
        data[i + 2] = clamp8(255 * (b + m));
        break;
      }
      case 'LAB': {
        const nc0 = c0 / 255.0;
        const nc1 = c1 / 255.0;
        const nc2 = c2 / 255.0;

        const L = 100.0 * nc0;
        const a = nc1 - 0.5;
        const b = nc2 - 0.5;

        const y = (L + 16.0) / 116.0;
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

        data[i] = clamp8(255.0 * fastRecorrectionxyz(xN * 3.2406 + yN * -1.5372 + zN * -0.4986));
        data[i + 1] = clamp8(255.0 * fastRecorrectionxyz(xN * -0.9689 + yN * 1.8758 + zN * 0.0415));
        data[i + 2] = clamp8(255.0 * fastRecorrectionxyz(xN * 0.0557 + yN * -0.204 + zN * 1.057));
        break;
      }
      case 'LUV': {
        const L = 100.0 * (c0 / 255.0);
        const u = 354.0 * (c1 / 255.0) - 134.0;
        const v = 262.0 * (c2 / 255.0) - 140.0;

        const Y = L > CIEK2epsilon ? Math.pow((L + 16.0) / 116.0, 3.0) : L / CIEK;
        const L13 = 13.0 * L;
        const L52 = 52.0 * L;
        const Y5 = 5.0 * Y;
        const L13u = L52 / (u + L13 * D65FX_4);
        const X = (Y * ((39.0 * L) / (v + L13 * D65FY_9) - 5.0) + Y5) / (((L13u - 1.0) / 3.0) + One_Third);
        const Z = X * ((L13u - 1.0) / 3.0) - Y5;

        data[i] = clamp8(255.0 * fastRecorrectionxyz(X * 3.2406 + Y * -1.5372 + Z * -0.4986));
        data[i + 1] = clamp8(255.0 * fastRecorrectionxyz(X * -0.9689 + Y * 1.8758 + Z * 0.0415));
        data[i + 2] = clamp8(255.0 * fastRecorrectionxyz(X * 0.0557 + Y * -0.204 + Z * 1.057));
        break;
      }
    }
  }
}
