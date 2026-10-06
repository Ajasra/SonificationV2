// Ultra-High-Performance Direct 1-Pass Stream Serialization
import type { StreamConfig } from '../types/index.ts';
import {
  LUT_ALAW_8,
  LUT_ULAW_8,
  LUT_LINEAR_8,
  LUT_REV_ALAW_4096,
  LUT_REV_ULAW_4096,
} from './fast-lut.ts';

const s8 = 1.0 / 0xff;
const s16 = 1.0 / 0xffff;
const s24 = 1.0 / 0xffffff;

let cachedByteStream = new Uint8Array(0);
function ensureByteStream(size: number): Uint8Array {
  if (cachedByteStream.length < size) {
    cachedByteStream = new Uint8Array(size);
  }
  return cachedByteStream;
}

export function imageToAudioStream(
  rgba: Uint8ClampedArray,
  cfg: StreamConfig,
  outSamples?: Float32Array
): Float32Array {
  const numPixels = rgba.length >> 2;
  const totalColorBytes = numPixels * 3;
  const bits = cfg.bits;
  const bytesPerSample = bits === 8 ? 1 : bits === 16 ? 2 : 3;
  const numSamples = Math.floor(totalColorBytes / bytesPerSample);
  const samples = outSamples && outSamples.length >= numSamples ? outSamples : new Float32Array(numSamples);

  // DIRECT 1-PASS PATH for 8-bit unsigned (bypasses byteStream completely!)
  if (bits === 8 && cfg.sign === 'UNSIGNED') {
    const lut = cfg.law === 'A_LAW' ? LUT_ALAW_8 : cfg.law === 'U_LAW' ? LUT_ULAW_8 : LUT_LINEAR_8;

    if (cfg.rawType === 'PLANAR') {
      let rIdx = 0;
      let gIdx = numPixels;
      let bIdx = numPixels << 1;
      const len = rgba.length;
      for (let i = 0; i < len; i += 4) {
        samples[rIdx++] = lut[rgba[i]];
        samples[gIdx++] = lut[rgba[i + 1]];
        samples[bIdx++] = lut[rgba[i + 2]];
      }
      return samples;
    } else {
      let s = 0;
      const len = rgba.length;
      for (let i = 0; i < len; i += 4) {
        samples[s++] = lut[rgba[i]];
        samples[s++] = lut[rgba[i + 1]];
        samples[s++] = lut[rgba[i + 2]];
      }
      return samples;
    }
  }

  // General fallback for 16-bit / 24-bit / signed modes
  const byteStream = ensureByteStream(totalColorBytes);
  if (cfg.rawType === 'PLANAR') {
    let rIdx = 0;
    let gIdx = numPixels;
    let bIdx = numPixels << 1;
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

  let bytePtr = 0;
  const isBigEndian = cfg.endianess === 'BIG_ENDIAN';
  const isSigned = cfg.sign === 'SIGNED';

  for (let s = 0; s < numSamples; s++) {
    const b1 = byteStream[bytePtr++];
    const b2 = bytesPerSample >= 2 ? byteStream[bytePtr++] : 0;
    const b3 = bytesPerSample === 3 ? byteStream[bytePtr++] : 0;

    let ires = b1;
    if (isBigEndian && bits !== 8) {
      ires = (ires << 8) | b2;
      if (bits === 24) ires = (ires << 8) | b3;
    } else if (!isBigEndian && bits !== 8) {
      ires |= b2 << 8;
      if (bits === 24) ires |= b3 << 16;
    }

    let res = 0.0;
    if (isSigned) {
      ires = (ires << (32 - bits)) >> (32 - bits);
      res = bits === 8 ? 2.0 * (ires * s8) : bits === 16 ? 2.0 * (ires * s16) : 2.0 * (ires * s24);
    } else {
      res = bits === 8 ? 2.0 * (ires * s8 - 0.5) : bits === 16 ? 2.0 * (ires * s16 - 0.5) : 2.0 * (ires * s24 - 0.5);
    }

    samples[s] = res < -1.0 ? -1.0 : res > 1.0 ? 1.0 : res;
  }

  return samples;
}

export function audioStreamToImage(
  samples: Float32Array,
  cfg: StreamConfig,
  outRgba: Uint8ClampedArray
): void {
  const numPixels = outRgba.length >> 2;
  const totalColorBytes = numPixels * 3;
  const bits = cfg.bits;
  const bytesPerSample = bits === 8 ? 1 : bits === 16 ? 2 : 3;
  const numSamples = Math.min(samples.length, Math.floor(totalColorBytes / bytesPerSample));

  // DIRECT 1-PASS PATH for 8-bit unsigned
  if (bits === 8 && cfg.sign === 'UNSIGNED') {
    if (cfg.rawType === 'PLANAR') {
      let rIdx = 0;
      let gIdx = numPixels;
      let bIdx = numPixels << 1;
      const len = outRgba.length;

      if (cfg.law === 'A_LAW') {
        for (let i = 0; i < len; i += 4) {
          const rS = samples[rIdx++];
          const gS = samples[gIdx++];
          const bS = samples[bIdx++];
          outRgba[i] = LUT_REV_ALAW_4096[Math.max(0, Math.min(4095, ((rS + 1.0) * 2047.5) | 0))];
          outRgba[i + 1] = LUT_REV_ALAW_4096[Math.max(0, Math.min(4095, ((gS + 1.0) * 2047.5) | 0))];
          outRgba[i + 2] = LUT_REV_ALAW_4096[Math.max(0, Math.min(4095, ((bS + 1.0) * 2047.5) | 0))];
          outRgba[i + 3] = 255;
        }
      } else if (cfg.law === 'U_LAW') {
        for (let i = 0; i < len; i += 4) {
          const rS = samples[rIdx++];
          const gS = samples[gIdx++];
          const bS = samples[bIdx++];
          outRgba[i] = LUT_REV_ULAW_4096[Math.max(0, Math.min(4095, ((rS + 1.0) * 2047.5) | 0))];
          outRgba[i + 1] = LUT_REV_ULAW_4096[Math.max(0, Math.min(4095, ((gS + 1.0) * 2047.5) | 0))];
          outRgba[i + 2] = LUT_REV_ULAW_4096[Math.max(0, Math.min(4095, ((bS + 1.0) * 2047.5) | 0))];
          outRgba[i + 3] = 255;
        }
      } else {
        for (let i = 0; i < len; i += 4) {
          const rV = (255 * (0.5 * samples[rIdx++] + 0.5)) | 0;
          const gV = (255 * (0.5 * samples[gIdx++] + 0.5)) | 0;
          const bV = (255 * (0.5 * samples[bIdx++] + 0.5)) | 0;
          outRgba[i] = rV < 0 ? 0 : rV > 255 ? 255 : rV;
          outRgba[i + 1] = gV < 0 ? 0 : gV > 255 ? 255 : gV;
          outRgba[i + 2] = bV < 0 ? 0 : bV > 255 ? 255 : bV;
          outRgba[i + 3] = 255;
        }
      }
      return;
    } else {
      // INTERLEAVED direct 1-pass
      let s = 0;
      const len = outRgba.length;
      if (cfg.law === 'A_LAW') {
        for (let i = 0; i < len; i += 4) {
          outRgba[i] = LUT_REV_ALAW_4096[Math.max(0, Math.min(4095, ((samples[s++] + 1.0) * 2047.5) | 0))];
          outRgba[i + 1] = LUT_REV_ALAW_4096[Math.max(0, Math.min(4095, ((samples[s++] + 1.0) * 2047.5) | 0))];
          outRgba[i + 2] = LUT_REV_ALAW_4096[Math.max(0, Math.min(4095, ((samples[s++] + 1.0) * 2047.5) | 0))];
          outRgba[i + 3] = 255;
        }
      } else if (cfg.law === 'U_LAW') {
        for (let i = 0; i < len; i += 4) {
          outRgba[i] = LUT_REV_ULAW_4096[Math.max(0, Math.min(4095, ((samples[s++] + 1.0) * 2047.5) | 0))];
          outRgba[i + 1] = LUT_REV_ULAW_4096[Math.max(0, Math.min(4095, ((samples[s++] + 1.0) * 2047.5) | 0))];
          outRgba[i + 2] = LUT_REV_ULAW_4096[Math.max(0, Math.min(4095, ((samples[s++] + 1.0) * 2047.5) | 0))];
          outRgba[i + 3] = 255;
        }
      } else {
        for (let i = 0; i < len; i += 4) {
          const rV = (255 * (0.5 * samples[s++] + 0.5)) | 0;
          const gV = (255 * (0.5 * samples[s++] + 0.5)) | 0;
          const bV = (255 * (0.5 * samples[s++] + 0.5)) | 0;
          outRgba[i] = rV < 0 ? 0 : rV > 255 ? 255 : rV;
          outRgba[i + 1] = gV < 0 ? 0 : gV > 255 ? 255 : gV;
          outRgba[i + 2] = bV < 0 ? 0 : bV > 255 ? 255 : bV;
          outRgba[i + 3] = 255;
        }
      }
      return;
    }
  }

  // General path fallback
  const byteStream = ensureByteStream(totalColorBytes);
  let bytePtr = 0;
  const isBigEndian = cfg.endianess === 'BIG_ENDIAN';
  const isSigned = cfg.sign === 'SIGNED';
  const sh = isSigned ? 0.0 : 0.5;

  for (let s = 0; s < numSamples; s++) {
    const res = samples[s];
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

  if (cfg.rawType === 'PLANAR') {
    let rIdx = 0;
    let gIdx = numPixels;
    let bIdx = numPixels << 1;
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
