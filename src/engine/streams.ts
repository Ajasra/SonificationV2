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
    const in32 = new Uint32Array(rgba.buffer, rgba.byteOffset, numPixels);

    if (cfg.rawType === 'PLANAR') {
      let rIdx = 0;
      let gIdx = numPixels;
      let bIdx = numPixels << 1;
      for (let i = 0; i < numPixels; i++) {
        const pix = in32[i];
        samples[rIdx++] = lut[pix & 0xff];
        samples[gIdx++] = lut[(pix >> 8) & 0xff];
        samples[bIdx++] = lut[(pix >> 16) & 0xff];
      }
      return samples;
    } else {
      let s = 0;
      for (let i = 0; i < numPixels; i++) {
        const pix = in32[i];
        samples[s++] = lut[pix & 0xff];
        samples[s++] = lut[(pix >> 8) & 0xff];
        samples[s++] = lut[(pix >> 16) & 0xff];
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

  // DIRECT 1-PASS PATH for 8-bit unsigned (Single 32-bit store per pixel)
  if (bits === 8 && cfg.sign === 'UNSIGNED') {
    const out32 = new Uint32Array(outRgba.buffer, outRgba.byteOffset, numPixels);

    if (cfg.rawType === 'PLANAR') {
      let rIdx = 0;
      let gIdx = numPixels;
      let bIdx = numPixels << 1;

      if (cfg.law === 'A_LAW') {
        for (let i = 0; i < numPixels; i++) {
          let rI = ((samples[rIdx++] + 1.0) * 2047.5) | 0;
          let gI = ((samples[gIdx++] + 1.0) * 2047.5) | 0;
          let bI = ((samples[bIdx++] + 1.0) * 2047.5) | 0;
          if (rI < 0) rI = 0; else if (rI > 4095) rI = 4095;
          if (gI < 0) gI = 0; else if (gI > 4095) gI = 4095;
          if (bI < 0) bI = 0; else if (bI > 4095) bI = 4095;
          out32[i] = 0xff000000 | (LUT_REV_ALAW_4096[bI] << 16) | (LUT_REV_ALAW_4096[gI] << 8) | LUT_REV_ALAW_4096[rI];
        }
      } else if (cfg.law === 'U_LAW') {
        for (let i = 0; i < numPixels; i++) {
          let rI = ((samples[rIdx++] + 1.0) * 2047.5) | 0;
          let gI = ((samples[gIdx++] + 1.0) * 2047.5) | 0;
          let bI = ((samples[bIdx++] + 1.0) * 2047.5) | 0;
          if (rI < 0) rI = 0; else if (rI > 4095) rI = 4095;
          if (gI < 0) gI = 0; else if (gI > 4095) gI = 4095;
          if (bI < 0) bI = 0; else if (bI > 4095) bI = 4095;
          out32[i] = 0xff000000 | (LUT_REV_ULAW_4096[bI] << 16) | (LUT_REV_ULAW_4096[gI] << 8) | LUT_REV_ULAW_4096[rI];
        }
      } else {
        for (let i = 0; i < numPixels; i++) {
          let rV = ((samples[rIdx++] + 1.0) * 127.5) | 0;
          let gV = ((samples[gIdx++] + 1.0) * 127.5) | 0;
          let bV = ((samples[bIdx++] + 1.0) * 127.5) | 0;
          if (rV < 0) rV = 0; else if (rV > 255) rV = 255;
          if (gV < 0) gV = 0; else if (gV > 255) gV = 255;
          if (bV < 0) bV = 0; else if (bV > 255) bV = 255;
          out32[i] = 0xff000000 | (bV << 16) | (gV << 8) | rV;
        }
      }
      return;
    } else {
      // INTERLEAVED direct 1-pass
      let s = 0;
      if (cfg.law === 'A_LAW') {
        for (let i = 0; i < numPixels; i++) {
          let rI = ((samples[s++] + 1.0) * 2047.5) | 0;
          let gI = ((samples[s++] + 1.0) * 2047.5) | 0;
          let bI = ((samples[s++] + 1.0) * 2047.5) | 0;
          if (rI < 0) rI = 0; else if (rI > 4095) rI = 4095;
          if (gI < 0) gI = 0; else if (gI > 4095) gI = 4095;
          if (bI < 0) bI = 0; else if (bI > 4095) bI = 4095;
          out32[i] = 0xff000000 | (LUT_REV_ALAW_4096[bI] << 16) | (LUT_REV_ALAW_4096[gI] << 8) | LUT_REV_ALAW_4096[rI];
        }
      } else if (cfg.law === 'U_LAW') {
        for (let i = 0; i < numPixels; i++) {
          let rI = ((samples[s++] + 1.0) * 2047.5) | 0;
          let gI = ((samples[s++] + 1.0) * 2047.5) | 0;
          let bI = ((samples[s++] + 1.0) * 2047.5) | 0;
          if (rI < 0) rI = 0; else if (rI > 4095) rI = 4095;
          if (gI < 0) gI = 0; else if (gI > 4095) gI = 4095;
          if (bI < 0) bI = 0; else if (bI > 4095) bI = 4095;
          out32[i] = 0xff000000 | (LUT_REV_ULAW_4096[bI] << 16) | (LUT_REV_ULAW_4096[gI] << 8) | LUT_REV_ULAW_4096[rI];
        }
      } else {
        for (let i = 0; i < numPixels; i++) {
          let rV = ((samples[s++] + 1.0) * 127.5) | 0;
          let gV = ((samples[s++] + 1.0) * 127.5) | 0;
          let bV = ((samples[s++] + 1.0) * 127.5) | 0;
          if (rV < 0) rV = 0; else if (rV > 255) rV = 255;
          if (gV < 0) gV = 0; else if (gV > 255) gV = 255;
          if (bV < 0) bV = 0; else if (bV > 255) bV = 255;
          out32[i] = 0xff000000 | (bV << 16) | (gV << 8) | rV;
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
