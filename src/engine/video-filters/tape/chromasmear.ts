import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp } from '../util.ts';

// 6. VHS / U-Matic Chroma Smear & Delay (Color-Under Subcarrier Low-Pass)
// Delays and low-passes the chrominance (Cb/Cr) channel horizontally relative to luminance (Y),
// reproducing the authentic color bleed and smear of analog magnetic videotape.
export class ChromaSmearFilter extends BaseVideoFilter {
  delay = 12;         // 0 to 40 (horizontal chroma delay in pixels to the right)
  bleed = 8;          // 1 to 30 (chroma low-pass blur width)
  saturation = 1.35;  // 0 to 3 (chroma saturation multiplier)
  noise = 0.08;       // 0 to 0.5 (chroma phase noise / subcarrier jitter)

  private cbBuffer = new Float32Array(0);
  private crBuffer = new Float32Array(0);

  init(width: number, height: number): void {
    super.init(width, height);
    if (this.cbBuffer.length < width) {
      this.cbBuffer = new Float32Array(width);
      this.crBuffer = new Float32Array(width);
    }
  }

  randomize(): void {
    this.delay = Math.round(4 + Math.random() * 20);
    this.bleed = Math.round(3 + Math.random() * 15);
    this.saturation = +(0.8 + Math.random() * 1.2).toFixed(2);
    this.noise = +(Math.random() * 0.15).toFixed(2);
  }

  setParams(p: Record<string, number>): void {
    if (p.delay !== undefined) this.delay = clamp(Math.round(p.delay), 0, 40);
    if (p.bleed !== undefined) this.bleed = clamp(Math.round(p.bleed), 1, 30);
    if (p.saturation !== undefined) this.saturation = clamp(p.saturation, 0, 3);
    if (p.noise !== undefined) this.noise = clamp(p.noise, 0, 0.5);
  }

  getParams(): Record<string, number> {
    return {
      delay: this.delay,
      bleed: this.bleed,
      saturation: this.saturation,
      noise: this.noise,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height, timeMs } = ctx;
    if (width <= 0 || height <= 0) return;

    if (this.cbBuffer.length < width) {
      this.cbBuffer = new Float32Array(width);
      this.crBuffer = new Float32Array(width);
    }

    const cbBuf = this.cbBuffer;
    const crBuf = this.crBuffer;

    const del = this.delay;
    const bld = this.bleed;
    const sat = this.saturation;
    const nse = this.noise;
    const invBld = 1.0 / bld;

    const hasNoise = nse > 0;
    const nseScale = nse * 20;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 4;
      let noiseSeed = (timeMs | 0) ^ (y * 31337);

      // 1. Extract Chrominance Cb and Cr per line
      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x * 4;
        const r = rgba[idx];
        const g = rgba[idx + 1];
        const b = rgba[idx + 2];

        // Standard ITU-R BT.601 Color Matrix
        // Cb = -0.168736*R - 0.331264*G + 0.5*B
        // Cr =  0.5*R - 0.418688*G - 0.081312*B
        cbBuf[x] = (-0.168736 * r - 0.331264 * g + 0.5 * b) * sat;
        crBuf[x] = (0.5 * r - 0.418688 * g - 0.081312 * b) * sat;
      }

      // 2. Horizontal moving-average low-pass + delay shift
      let sumCb = 0;
      let sumCr = 0;
      for (let i = 0; i < bld && i < width; i++) {
        sumCb += cbBuf[i];
        sumCr += crBuf[i];
      }

      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x * 4;
        const r = rgba[idx];
        const g = rgba[idx + 1];
        const b = rgba[idx + 2];

        // Sharp Luminance Y (un-delayed)
        const yLuma = 0.299 * r + 0.587 * g + 0.114 * b;

        // Slide the low-pass window
        if (x + bld < width) {
          sumCb += cbBuf[x + bld] - cbBuf[x];
          sumCr += crBuf[x + bld] - crBuf[x];
        }

        // Apply delay offset (delayed to the right by `del` pixels)
        const delayedX = x - del;
        let delayedCb = sumCb * invBld;
        let delayedCr = sumCr * invBld;

        if (delayedX >= 0 && delayedX < width) {
          delayedCb = cbBuf[delayedX];
          delayedCr = crBuf[delayedX];
        }

        if (hasNoise) {
          noiseSeed = (noiseSeed * 1664525 + 1013904223) | 0;
          const noiseSample = (((noiseSeed >>> 16) - 32768) * (1.0 / 32768.0)) * nseScale;
          delayedCb += noiseSample;
          delayedCr += noiseSample * 0.5;
        }

        // Reconstruct RGB from sharp Y and smeared Cb/Cr:
        // R = Y + 1.402 * Cr
        // G = Y - 0.344136 * Cb - 0.714136 * Cr
        // B = Y + 1.772 * Cb
        const newR = yLuma + 1.402 * delayedCr;
        const newG = yLuma - 0.344136 * delayedCb - 0.714136 * delayedCr;
        const newB = yLuma + 1.772 * delayedCb;

        rgba[idx] = newR < 0 ? 0 : newR > 255 ? 255 : (newR | 0);
        rgba[idx + 1] = newG < 0 ? 0 : newG > 255 ? 255 : (newG | 0);
        rgba[idx + 2] = newB < 0 ? 0 : newB > 255 ? 255 : (newB | 0);
      }
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'chromasmear',
    name: 'VHS Chroma Smear',
    category: 'tape',
    description: 'Analog videotape color-under subcarrier: delays and low-passes chroma channels, creating color bleed.',
    params: [
      { name: 'delay', label: 'Chroma Delay', type: 'int', min: 0, max: 40, step: 1, value: 12, tooltip: 'Horizontal delay of color channels to the right (pixels)' },
      { name: 'bleed', label: 'Color Bleed', type: 'int', min: 1, max: 30, step: 1, value: 8, tooltip: 'Horizontal low-pass blur width of the chroma carrier' },
      { name: 'saturation', label: 'Chroma Gain', type: 'float', min: 0, max: 3, step: 0.1, value: 1.35, tooltip: 'Color saturation multiplier' },
      { name: 'noise', label: 'Subcarrier Noise', type: 'float', min: 0, max: 0.5, step: 0.02, value: 0.08, tooltip: 'Chroma phase noise and subcarrier jitter' },
    ],
  },
  create: () => new ChromaSmearFilter(),
};
