// Fast 3-channel Histogram Equalization & Normalization
// Ported from Processing helper.pde

function clamp8(val: number): number {
  return val < 0 ? 0 : val > 255 ? 255 : Math.round(val);
}

export function equalizeHistogram(rgba: Uint8ClampedArray): void {
  const numPixels = rgba.length / 4;
  if (numPixels === 0) return;

  const histR = new Float32Array(256);
  const histG = new Float32Array(256);
  const histB = new Float32Array(256);

  const invLen = 1.0 / numPixels;

  for (let i = 0; i < rgba.length; i += 4) {
    histR[rgba[i]] += invLen;
    histG[rgba[i + 1]] += invLen;
    histB[rgba[i + 2]] += invLen;
  }

  const lookR = new Uint8Array(256);
  const lookG = new Uint8Array(256);
  const lookB = new Uint8Array(256);

  let sumR = 0.0;
  let sumG = 0.0;
  let sumB = 0.0;

  for (let i = 0; i < 256; i++) {
    sumR += histR[i];
    sumG += histG[i];
    sumB += histB[i];

    lookR[i] = clamp8(Math.floor(sumR * 255));
    lookG[i] = clamp8(Math.floor(sumG * 255));
    lookB[i] = clamp8(Math.floor(sumB * 255));
  }

  let minR = 256, maxR = -1;
  let minG = 256, maxG = -1;
  let minB = 256, maxB = -1;

  for (let i = 0; i < 256; i++) {
    const r = lookR[i];
    const g = lookG[i];
    const b = lookB[i];

    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (g < minG) minG = g;
    if (g > maxG) maxG = g;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }

  const rangeR = maxR > minR ? maxR - minR : 1;
  const rangeG = maxG > minG ? maxG - minG : 1;
  const rangeB = maxB > minB ? maxB - minB : 1;

  const mapR = new Uint8Array(256);
  const mapG = new Uint8Array(256);
  const mapB = new Uint8Array(256);

  for (let i = 0; i < 256; i++) {
    mapR[i] = clamp8(((lookR[i] - minR) / rangeR) * 255);
    mapG[i] = clamp8(((lookG[i] - minG) / rangeG) * 255);
    mapB[i] = clamp8(((lookB[i] - minB) / rangeB) * 255);
  }

  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = mapR[rgba[i]];
    rgba[i + 1] = mapG[rgba[i + 1]];
    rgba[i + 2] = mapB[rgba[i + 2]];
  }
}
