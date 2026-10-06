// High-performance audio stream serialization & quantization
// Converts between 2D image pixel bytes (RGBA) and 1D Audio float buffers [-1.0, 1.0]

import type { StreamConfig } from '../types/index.ts';

const s8 = 1.0 / 0xff;
const s16 = 1.0 / 0xffff;
const s24 = 1.0 / 0xffffff;

const A = 87.6;
const rA = 1.0 / A;
const lnA = 1.0 + Math.log(A);
const rlnA = 1.0 / lnA;

export function alaw(x: number): number {
  const sgn = x < 0 ? -1.0 : 1.0;
  const absx = Math.abs(x);
  if (absx < rA) {
    return (sgn * (A * absx)) / lnA;
  } else {
    return (sgn * (1.0 + Math.log(A * absx))) / lnA;
  }
}

export function revalaw(x: number): number {
  const sgn = x < 0 ? -1.0 : 1.0;
  const absx = Math.abs(x);
  if (absx < rlnA) {
    return (sgn * (absx * lnA)) / A;
  } else {
    return (sgn * Math.exp(absx * lnA - 1.0)) / A;
  }
}

const U = 255.0;
const rU = 1.0 / 255.0;
const U1 = 1.0 + U;
const lnU = Math.log(U1);

export function ulaw(x: number): number {
  const sgn = x < 0 ? -1.0 : 1.0;
  return (sgn * Math.log(1.0 + U * Math.abs(x))) / lnU;
}

export function revulaw(x: number): number {
  const sgn = x < 0 ? -1.0 : 1.0;
  return sgn * rU * (Math.pow(U1, Math.abs(x)) - 1.0);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// Convert image RGBA pixels into 1D Audio PCM float array [-1.0, 1.0]
export function imageToAudioStream(
  rgba: Uint8ClampedArray,
  cfg: StreamConfig,
  outSamples?: Float32Array
): Float32Array {
  const numPixels = rgba.length / 4;
  const totalColorBytes = numPixels * 3;

  // Linearize RGB bytes into a flat sequence based on topology (PLANAR vs INTERLEAVED)
  const byteStream = new Uint8Array(totalColorBytes);
  if (cfg.rawType === 'PLANAR') {
    let rIdx = 0;
    let gIdx = numPixels;
    let bIdx = numPixels * 2;
    for (let i = 0; i < rgba.length; i += 4) {
      byteStream[rIdx++] = rgba[i];
      byteStream[gIdx++] = rgba[i + 1];
      byteStream[bIdx++] = rgba[i + 2];
    }
  } else {
    let bIdx = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      byteStream[bIdx++] = rgba[i];
      byteStream[bIdx++] = rgba[i + 1];
      byteStream[bIdx++] = rgba[i + 2];
    }
  }

  // Determine number of audio samples based on bit depth
  const bytesPerSample = cfg.bits === 8 ? 1 : cfg.bits === 16 ? 2 : 3;
  const numSamples = Math.floor(totalColorBytes / bytesPerSample);

  const samples = outSamples && outSamples.length >= numSamples ? outSamples : new Float32Array(numSamples);

  let bytePtr = 0;
  const isBigEndian = cfg.endianess === 'BIG_ENDIAN';
  const isSigned = cfg.sign === 'SIGNED';
  const bits = cfg.bits;
  const law = cfg.law;

  for (let s = 0; s < numSamples; s++) {
    const b1 = byteStream[bytePtr++];
    const b2 = bytesPerSample >= 2 ? byteStream[bytePtr++] : 0;
    const b3 = bytesPerSample === 3 ? byteStream[bytePtr++] : 0;

    let ires = b1;
    if (isBigEndian && bits !== 8) {
      ires = (ires << 8) | b2;
      if (bits === 24) ires = (ires << 8) | b3;
    } else if (!isBigEndian && bits !== 8) {
      ires |= (b2 << 8);
      if (bits === 24) ires |= (b3 << 16);
    }

    let res = 0.0;
    if (isSigned) {
      ires = (ires << (32 - bits)) >> (32 - bits);
      if (bits === 8) res = 2.0 * (ires * s8);
      else if (bits === 16) res = 2.0 * (ires * s16);
      else res = 2.0 * (ires * s24);
    } else {
      if (bits === 8) res = 2.0 * (ires * s8 - 0.5);
      else if (bits === 16) res = 2.0 * (ires * s16 - 0.5);
      else res = 2.0 * (ires * s24 - 0.5);
    }

    if (law === 'U_LAW') {
      res = ulaw(res);
    } else if (law === 'A_LAW') {
      res = alaw(res);
    }

    samples[s] = clamp(res, -1.0, 1.0);
  }

  return samples;
}

// Convert 1D Audio PCM float array [-1.0, 1.0] back into image RGBA pixels
export function audioStreamToImage(
  samples: Float32Array,
  cfg: StreamConfig,
  outRgba: Uint8ClampedArray
): void {
  const numPixels = outRgba.length / 4;
  const totalColorBytes = numPixels * 3;
  const byteStream = new Uint8Array(totalColorBytes);

  const bytesPerSample = cfg.bits === 8 ? 1 : cfg.bits === 16 ? 2 : 3;
  const numSamples = Math.min(samples.length, Math.floor(totalColorBytes / bytesPerSample));

  const isBigEndian = cfg.endianess === 'BIG_ENDIAN';
  const isSigned = cfg.sign === 'SIGNED';
  const bits = cfg.bits;
  const law = cfg.law;
  const sh = isSigned ? 0.0 : 0.5;

  let bytePtr = 0;
  for (let s = 0; s < numSamples; s++) {
    let res = samples[s];

    if (law === 'U_LAW') {
      res = revulaw(res);
    } else if (law === 'A_LAW') {
      res = revalaw(res);
    }

    let ires = 0;
    if (bits === 8) {
      ires = 0xff & Math.floor(0xff * (0.5 * res + sh));
    } else if (bits === 16) {
      ires = 0xffff & Math.floor(0xffff * (0.5 * res + sh));
    } else {
      ires = 0xffffff & Math.floor(0xffffff * (0.5 * res + sh));
    }

    if (isBigEndian) {
      if (bits === 24) byteStream[bytePtr++] = (ires >> 16) & 0xff;
      if (bits >= 16) byteStream[bytePtr++] = (ires >> 8) & 0xff;
      byteStream[bytePtr++] = ires & 0xff;
    } else {
      byteStream[bytePtr++] = ires & 0xff;
      if (bits >= 16) byteStream[bytePtr++] = (ires >> 8) & 0xff;
      if (bits === 24) byteStream[bytePtr++] = (ires >> 16) & 0xff;
    }
  }

  // Map byteStream back into RGBA channels according to rawType (PLANAR vs INTERLEAVED)
  if (cfg.rawType === 'PLANAR') {
    let rIdx = 0;
    let gIdx = numPixels;
    let bIdx = numPixels * 2;
    for (let i = 0; i < outRgba.length; i += 4) {
      outRgba[i] = byteStream[rIdx++];
      outRgba[i + 1] = byteStream[gIdx++];
      outRgba[i + 2] = byteStream[bIdx++];
      outRgba[i + 3] = 255;
    }
  } else {
    let bIdx = 0;
    for (let i = 0; i < outRgba.length; i += 4) {
      outRgba[i] = byteStream[bIdx++];
      outRgba[i + 1] = byteStream[bIdx++];
      outRgba[i + 2] = byteStream[bIdx++];
      outRgba[i + 3] = 255;
    }
  }
}
