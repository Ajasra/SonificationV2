// Fast 3-channel Histogram Equalization with Integer CDF Lookups
function clamp8(val: number): number {
  return val < 0 ? 0 : val > 255 ? 255 : (val | 0);
}

const histR = new Uint32Array(256);
const histG = new Uint32Array(256);
const histB = new Uint32Array(256);

const mapR = new Uint8Array(256);
const mapG = new Uint8Array(256);
const mapB = new Uint8Array(256);

export function equalizeHistogram(rgba: Uint8ClampedArray): void {
  const numPixels = rgba.length >> 2;
  if (numPixels === 0) return;

  histR.fill(0);
  histG.fill(0);
  histB.fill(0);

  const len = rgba.length;
  for (let i = 0; i < len; i += 4) {
    histR[rgba[i]]++;
    histG[rgba[i + 1]]++;
    histB[rgba[i + 2]]++;
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const invPixels = 255.0 / numPixels;

  let minR = 256, maxR = -1;
  let minG = 256, maxG = -1;
  let minB = 256, maxB = -1;

  for (let i = 0; i < 256; i++) {
    sumR += histR[i];
    sumG += histG[i];
    sumB += histB[i];

    const cdfR = (sumR * invPixels) | 0;
    const cdfG = (sumG * invPixels) | 0;
    const cdfB = (sumB * invPixels) | 0;

    mapR[i] = cdfR;
    mapG[i] = cdfG;
    mapB[i] = cdfB;

    if (cdfR < minR) minR = cdfR;
    if (cdfR > maxR) maxR = cdfR;
    if (cdfG < minG) minG = cdfG;
    if (cdfG > maxG) maxG = cdfG;
    if (cdfB < minB) minB = cdfB;
    if (cdfB > maxB) maxB = cdfB;
  }

  const rangeR = maxR > minR ? maxR - minR : 1;
  const rangeG = maxG > minG ? maxG - minG : 1;
  const rangeB = maxB > minB ? maxB - minB : 1;

  for (let i = 0; i < 256; i++) {
    mapR[i] = clamp8(((mapR[i] - minR) / rangeR) * 255);
    mapG[i] = clamp8(((mapG[i] - minG) / rangeG) * 255);
    mapB[i] = clamp8(((mapB[i] - minB) / rangeB) * 255);
  }

  for (let i = 0; i < len; i += 4) {
    rgba[i] = mapR[rgba[i]];
    rgba[i + 1] = mapG[rgba[i + 1]];
    rgba[i + 2] = mapB[rgba[i + 2]];
  }
}
