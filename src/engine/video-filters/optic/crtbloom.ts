import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp, clampByte } from '../util.ts';

// 7. CRT Phosphor Bloom & Aperture Grille (P22 Trinitron Display Emulation)
// Simulates electron beam spot defocusing on high-luminance peaks (bloom/halation)
// paired with vertical RGB triad aperture grille stripes and horizontal scanline attenuation.
export class CrtBloomFilter extends BaseVideoFilter {
  bloom = 0.8;      // 0 to 2 (phosphor glow / halation intensity on highlights)
  grille = 0.35;    // 0 to 1 (vertical RGB aperture grille stripe strength)
  scanlines = 0.4;  // 0 to 1 (horizontal scanline dimming strength)
  threshold = 140;  // 60 to 240 (luminance knee where bloom begins)

  private bloomRowBuf = new Float32Array(0);

  init(width: number, height: number): void {
    super.init(width, height);
    if (this.bloomRowBuf.length < width * 3) {
      this.bloomRowBuf = new Float32Array(width * 3);
    }
  }

  randomize(): void {
    this.bloom = +(0.4 + Math.random() * 1.2).toFixed(2);
    this.grille = +(0.2 + Math.random() * 0.5).toFixed(2);
    this.scanlines = +(0.2 + Math.random() * 0.5).toFixed(2);
    this.threshold = Math.round(100 + Math.random() * 80);
  }

  setParams(p: Record<string, number>): void {
    if (p.bloom !== undefined) this.bloom = clamp(p.bloom, 0, 2);
    if (p.grille !== undefined) this.grille = clamp(p.grille, 0, 1);
    if (p.scanlines !== undefined) this.scanlines = clamp(p.scanlines, 0, 1);
    if (p.threshold !== undefined) this.threshold = clamp(Math.round(p.threshold), 60, 240);
  }

  getParams(): Record<string, number> {
    return {
      bloom: this.bloom,
      grille: this.grille,
      scanlines: this.scanlines,
      threshold: this.threshold,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height } = ctx;
    if (width <= 0 || height <= 0) return;

    if (this.bloomRowBuf.length < width * 3) {
      this.bloomRowBuf = new Float32Array(width * 3);
    }

    const bIntensity = this.bloom;
    const gStrength = this.grille;
    const sStrength = this.scanlines;
    const thresh = this.threshold;
    const bloomBuf = this.bloomRowBuf;

    const scanlineDarkFactor = 1.0 - (sStrength * 0.4);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 4;
      const isOddScanline = (y & 1) === 1;

      // 1. Extract highlight energy for bloom
      if (bIntensity > 0) {
        for (let x = 0; x < width; x++) {
          const idx = rowOffset + x * 4;
          const r = rgba[idx];
          const g = rgba[idx + 1];
          const b = rgba[idx + 2];
          const luma = (r * 77 + g * 150 + b * 29) >> 8;

          if (luma > thresh) {
            const excess = (luma - thresh) * bIntensity;
            bloomBuf[x * 3] = r * (excess / 255.0);
            bloomBuf[x * 3 + 1] = g * (excess / 255.0);
            bloomBuf[x * 3 + 2] = b * (excess / 255.0);
          } else {
            bloomBuf[x * 3] = 0;
            bloomBuf[x * 3 + 1] = 0;
            bloomBuf[x * 3 + 2] = 0;
          }
        }
      }

      // 2. Apply phosphor halation spread and aperture grille
      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x * 4;
        let r = rgba[idx];
        let g = rgba[idx + 1];
        let b = rgba[idx + 2];

        // Horizontal 3-tap bloom spread
        if (bIntensity > 0) {
          const leftX = x > 0 ? x - 1 : 0;
          const rightX = x + 1 < width ? x + 1 : width - 1;
          const haloR = bloomBuf[x * 3] * 0.5 + (bloomBuf[leftX * 3] + bloomBuf[rightX * 3]) * 0.25;
          const haloG = bloomBuf[x * 3 + 1] * 0.5 + (bloomBuf[leftX * 3 + 1] + bloomBuf[rightX * 3 + 1]) * 0.25;
          const haloB = bloomBuf[x * 3 + 2] * 0.5 + (bloomBuf[leftX * 3 + 2] + bloomBuf[rightX * 3 + 2]) * 0.25;
          r += haloR;
          g += haloG;
          b += haloB;
        }

        // CRT Aperture Grille (repeating RGB triad columns)
        if (gStrength > 0) {
          const colMod = x % 3;
          const dim = 1.0 - gStrength * 0.45;
          if (colMod === 0) {
            g *= dim;
            b *= dim;
          } else if (colMod === 1) {
            r *= dim;
            b *= dim;
          } else {
            r *= dim;
            g *= dim;
          }
        }

        // Horizontal scanline darkening
        if (isOddScanline && sStrength > 0) {
          r *= scanlineDarkFactor;
          g *= scanlineDarkFactor;
          b *= scanlineDarkFactor;
        }

        rgba[idx] = clampByte(r);
        rgba[idx + 1] = clampByte(g);
        rgba[idx + 2] = clampByte(b);
      }
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'crtbloom',
    name: 'P22 Phosphor Bloom',
    category: 'optic',
    description: 'CRT beam physics: highlight phosphor halation, aperture grille RGB triads, and scanlines.',
    params: [
      { name: 'bloom', label: 'Halation Gain', type: 'float', min: 0, max: 2, step: 0.05, value: 0.8, tooltip: 'Phosphor bloom and glow spreading from bright highlights' },
      { name: 'grille', label: 'Aperture Grille', type: 'float', min: 0, max: 1, step: 0.05, value: 0.35, tooltip: 'Trinitron RGB vertical phosphor stripe intensity' },
      { name: 'scanlines', label: 'Scanline Depth', type: 'float', min: 0, max: 1, step: 0.05, value: 0.4, tooltip: 'CRT alternate scanline attenuation' },
      { name: 'threshold', label: 'Bloom Knee', type: 'int', min: 60, max: 240, step: 2, value: 140, tooltip: 'Minimum luminance threshold where halation begins' },
    ],
  },
  create: () => new CrtBloomFilter(),
};
