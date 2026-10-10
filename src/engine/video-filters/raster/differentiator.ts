import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp, clampByte } from '../util.ts';

// 4. Sandin Differentiator (Analog Spatial High-Pass & Edge Contour Synthesizer)
// Simulates the Sandin Image Processor (1973) analog differentiator module.
// Computes the rate of change of video voltage across the horizontal scanline (dV/dx),
// extracting embossed relief and razor-sharp contour boundaries.
export class DifferentiatorFilter extends BaseVideoFilter {
  gain = 3.5;       // 0.5 to 10 (edge slope amplification)
  bias = 0;         // -128 to 128 (DC pedestal offset)
  bipolar = 1;      // 0 or 1 (0: unipolar absolute magnitude; 1: bipolar embossed relief around mid-gray)
  invert = 0;       // 0 or 1 (polarity inversion)

  randomize(): void {
    this.gain = +(1.5 + Math.random() * 5.5).toFixed(1);
    this.bias = Math.round(-30 + Math.random() * 60);
    this.bipolar = Math.random() > 0.4 ? 1 : 0;
    this.invert = Math.random() > 0.7 ? 1 : 0;
  }

  setParams(p: Record<string, number>): void {
    if (p.gain !== undefined) this.gain = clamp(p.gain, 0.5, 10);
    if (p.bias !== undefined) this.bias = clamp(p.bias, -128, 128);
    if (p.bipolar !== undefined) this.bipolar = clamp(p.bipolar, 0, 1);
    if (p.invert !== undefined) this.invert = clamp(p.invert, 0, 1);
  }

  getParams(): Record<string, number> {
    return {
      gain: this.gain,
      bias: this.bias,
      bipolar: this.bipolar,
      invert: this.invert,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height } = ctx;
    if (width <= 1 || height <= 0) return;

    const g = this.gain;
    const b = this.bias;
    const isBipolar = this.bipolar > 0.5;
    const inv = this.invert > 0.5;

    // Scanline-by-scanline differentiation (in reverse so we can read previous pixel)
    for (let y = 0; y < height; y++) {
      const lineStart = y * width * 4;

      // Cache the first pixel of the line
      let prevR = rgba[lineStart];
      let prevG = rgba[lineStart + 1];
      let prevB = rgba[lineStart + 2];

      for (let x = 1; x < width; x++) {
        const idx = lineStart + x * 4;
        const curR = rgba[idx];
        const curG = rgba[idx + 1];
        const curB = rgba[idx + 2];

        // Voltage derivative dV = V(t) - V(t - dt)
        let diffR = (curR - prevR) * g;
        let diffG = (curG - prevG) * g;
        let diffB = (curB - prevB) * g;

        if (inv) {
          diffR = -diffR;
          diffG = -diffG;
          diffB = -diffB;
        }

        let outR = isBipolar ? 128 + diffR + b : Math.abs(diffR) + b;
        let outG = isBipolar ? 128 + diffG + b : Math.abs(diffG) + b;
        let outB = isBipolar ? 128 + diffB + b : Math.abs(diffB) + b;

        prevR = curR;
        prevG = curG;
        prevB = curB;

        rgba[idx] = clampByte(outR);
        rgba[idx + 1] = clampByte(outG);
        rgba[idx + 2] = clampByte(outB);
      }

      // Handle the first pixel of scanline
      rgba[lineStart] = isBipolar ? 128 : 0;
      rgba[lineStart + 1] = isBipolar ? 128 : 0;
      rgba[lineStart + 2] = isBipolar ? 128 : 0;
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'differentiator',
    name: 'Sandin Differentiator',
    category: 'raster',
    description: 'Analog video spatial differentiator (Sandin IP): extracts dV/dx voltage slopes, embossed contours and edge lines.',
    params: [
      { name: 'gain', label: 'Slope Gain', type: 'float', min: 0.5, max: 10, step: 0.2, value: 3.5, tooltip: 'Amplification of voltage transition slope' },
      { name: 'bias', label: 'DC Pedestal', type: 'int', min: -128, max: 128, step: 2, value: 0, tooltip: 'DC baseline offset added to differentiated output' },
      { name: 'bipolar', label: 'Bipolar Mode', type: 'bool', min: 0, max: 1, step: 1, value: 1, tooltip: 'Bipolar (128 mid-gray embossed relief) vs Unipolar (absolute edge magnitude)' },
      { name: 'invert', label: 'Invert Polarity', type: 'bool', min: 0, max: 1, step: 1, value: 0, tooltip: 'Inverts direction of contour shading' },
    ],
  },
  create: () => new DifferentiatorFilter(),
};
