import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp, clampByte, hsvToRgb } from '../util.ts';

// 10. Fairlight CVI (Computer Video Instrument, 1984) / EMS Spectre
// Slices analog video into discrete voltage posterization steps with false-color
// palette assignment and solarized contour edge detection.
export class CviSlicerFilter extends BaseVideoFilter {
  levels = 6;       // 2 to 16 (number of quantized voltage levels)
  palette = 0;      // 0: Spectrum, 1: Amber P31, 2: Thermal, 3: Neon, 4: Solar Invert
  edgeThresh = 24;  // 4 to 80 (contour edge sensitivity)
  contourMix = 0.6; // 0.0 to 1.0 (outline mix)
  mix = 0.9;        // 0.0 to 1.0 (wet/dry)

  private lut: Uint8Array = new Uint8Array(256 * 3);

  constructor() {
    super();
    this.updatePaletteLut();
  }

  private updatePaletteLut(): void {
    const pal = this.palette;
    for (let i = 0; i < 256; i++) {
      const norm = i / 255;
      let r = 0, g = 0, b = 0;

      switch (pal) {
        case 0: { // Spectrum
          const rgb = hsvToRgb(norm * 320, 0.9, 0.95);
          r = rgb[0]; g = rgb[1]; b = rgb[2];
          break;
        }
        case 1: { // Amber P31 Monochrome Phosphor
          r = Math.round(norm * 255);
          g = Math.round(norm * 180);
          b = Math.round(norm * 30);
          break;
        }
        case 2: { // Thermal Heat
          if (norm < 0.33) {
            r = Math.round(norm * 3 * 255);
            g = 0;
            b = Math.round((1 - norm * 3) * 128);
          } else if (norm < 0.66) {
            r = 255;
            g = Math.round((norm - 0.33) * 3 * 255);
            b = 0;
          } else {
            r = 255;
            g = 255;
            b = Math.round((norm - 0.66) * 3 * 255);
          }
          break;
        }
        case 3: { // Cyberpunk Neon (Cyan - Magenta - Yellow)
          if (norm < 0.5) {
            r = Math.round(norm * 2 * 255);
            g = Math.round((1 - norm * 2) * 220);
            b = 255;
          } else {
            r = 255;
            g = Math.round((norm - 0.5) * 2 * 255);
            b = Math.round((1 - (norm - 0.5) * 2) * 255);
          }
          break;
        }
        case 4: default: { // Solar Invert
          const sol = norm > 0.5 ? (1.0 - norm) * 2.0 : norm * 2.0;
          r = Math.round(sol * 255);
          g = Math.round((1.0 - sol) * 230);
          b = Math.round(norm * 255);
          break;
        }
      }

      const idx = i * 3;
      this.lut[idx] = clampByte(r);
      this.lut[idx + 1] = clampByte(g);
      this.lut[idx + 2] = clampByte(b);
    }
  }

  private cachedNumLevels = -1;
  private cachedContourMix = -1;
  private quantLutR = new Uint8Array(256);
  private quantLutG = new Uint8Array(256);
  private quantLutB = new Uint8Array(256);
  private edgeLutR = new Uint8Array(256);
  private edgeLutG = new Uint8Array(256);
  private edgeLutB = new Uint8Array(256);

  private updateQuantLut(numLevels: number, contour: number): void {
    if (this.cachedNumLevels === numLevels && this.cachedContourMix === contour) return;
    this.cachedNumLevels = numLevels;
    this.cachedContourMix = contour;
    const step = 255 / (numLevels - 1);
    const lut = this.lut;
    const invContour = 1.0 - contour;
    const contour255 = 255 * contour;

    for (let luma = 0; luma < 256; luma++) {
      const quantIdx = clampByte(Math.round(Math.round(luma / step) * step));
      const lutIdx = quantIdx * 3;
      const r = lut[lutIdx];
      const g = lut[lutIdx + 1];
      const b = lut[lutIdx + 2];
      this.quantLutR[luma] = r;
      this.quantLutG[luma] = g;
      this.quantLutB[luma] = b;

      this.edgeLutR[luma] = (r * invContour + contour255 + 0.5) | 0;
      this.edgeLutG[luma] = g * invContour + contour255 + 0.5 | 0;
      this.edgeLutB[luma] = b * invContour + contour255 + 0.5 | 0;
    }
  }

  randomize(): void {
    this.levels = Math.floor(3 + Math.random() * 10);
    this.palette = Math.floor(Math.random() * 5);
    this.edgeThresh = Math.round(10 + Math.random() * 50);
    this.contourMix = +(0.3 + Math.random() * 0.7).toFixed(2);
    this.mix = +(0.7 + Math.random() * 0.3).toFixed(2);
    this.cachedNumLevels = -1;
    this.updatePaletteLut();
  }

  setParams(p: Record<string, number>): void {
    if (p.levels !== undefined) this.levels = clamp(Math.round(p.levels), 2, 16);
    if (p.palette !== undefined) {
      const newPal = clamp(Math.round(p.palette), 0, 4);
      if (newPal !== this.palette) {
        this.palette = newPal;
        this.cachedNumLevels = -1;
        this.updatePaletteLut();
      }
    }
    if (p.edgeThresh !== undefined) this.edgeThresh = clamp(p.edgeThresh, 4, 80);
    if (p.contourMix !== undefined) this.contourMix = clamp(p.contourMix, 0.0, 1.0);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0.0, 1.0);
  }

  getParams(): Record<string, number> {
    return {
      levels: this.levels,
      palette: this.palette,
      edgeThresh: this.edgeThresh,
      contourMix: this.contourMix,
      mix: this.mix,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height } = ctx;
    let numLevels = this.levels;

    // Audio reactivity: audio RMS modulates slice density
    if (ctx.audioRms && ctx.audioRms > 0.1) {
      numLevels = clamp(Math.round(numLevels - ctx.audioRms * 3), 2, 16);
    }

    const contour = this.contourMix;
    this.updateQuantLut(numLevels, contour);

    const wet = this.mix;
    const dry = 1.0 - wet;
    const ethresh = this.edgeThresh;
    const qR = this.quantLutR;
    const qG = this.quantLutG;
    const qB = this.quantLutB;
    const eR = this.edgeLutR;
    const eG = this.edgeLutG;
    const eB = this.edgeLutB;

    // In-place scanline processing with previous-pixel edge test
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 4;
      let prevLuma = (rgba[rowOffset] * 77 + rgba[rowOffset + 1] * 150 + rgba[rowOffset + 2] * 29) >> 8;

      for (let x = 0; x < width; x++) {
        const i = rowOffset + x * 4;
        const origR = rgba[i];
        const origG = rgba[i + 1];
        const origB = rgba[i + 2];

        const luma = (origR * 77 + origG * 150 + origB * 29) >> 8;

        const delta = luma > prevLuma ? luma - prevLuma : prevLuma - luma;
        const palR = delta > ethresh ? eR[luma] : qR[luma];
        const palG = delta > ethresh ? eG[luma] : qG[luma];
        const palB = delta > ethresh ? eB[luma] : qB[luma];

        prevLuma = luma;

        // Wet/dry mix
        rgba[i] = (origR * dry + palR * wet + 0.5) | 0;
        rgba[i + 1] = (origG * dry + palG * wet + 0.5) | 0;
        rgba[i + 2] = (origB * dry + palB * wet + 0.5) | 0;
      }
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'cvislicer',
    name: 'Fairlight CVI Slicer',
    category: 'color',
    description: 'Fairlight CVI quantized voltage slicing, false-color palettes, and solarized edge contours.',
    params: [
      { name: 'levels', label: 'Voltage Levels', type: 'int', min: 2, max: 16, step: 1, value: 6, tooltip: 'Quantized voltage step levels' },
      { name: 'palette', label: 'Palette Ramp', type: 'int', min: 0, max: 4, step: 1, value: 0, tooltip: 'False-color mapping (0:Spectrum, 1:P31 Amber, 2:Thermal, 3:Neon, 4:Solar Invert)' },
      { name: 'edgeThresh', label: 'Edge Thresh', type: 'int', min: 4, max: 80, step: 1, value: 24, tooltip: 'Contour edge outline sensitivity threshold' },
      { name: 'contourMix', label: 'Contour Mix', type: 'float', min: 0.0, max: 1.0, step: 0.05, value: 0.6, tooltip: 'Edge outline highlight intensity' },
      { name: 'mix', label: 'Wet Mix', type: 'float', min: 0.0, max: 1.0, step: 0.05, value: 0.9, tooltip: 'Wet / dry blend amount' },
    ],
  },
  create: () => new CviSlicerFilter(),
};
