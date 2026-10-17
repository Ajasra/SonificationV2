import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp, hsvToRgb } from '../util.ts';

// 2. Dave Jones Colorizer & Voltage Slicer (Classic Video Synthesizer)
// Slices luminance into discrete voltage bands and maps low/mid/high levels
// to user-selectable analog RGB color voltages.
export class ColorizerFilter extends BaseVideoFilter {
  lowHue = 210;    // 0 to 360 (degrees tint for shadow voltage band, default cyan-blue)
  midHue = 35;     // 0 to 360 (degrees tint for midtones, default warm amber)
  highHue = 85;    // 0 to 360 (degrees tint for highlights, default chartreuse)
  bands = 4;       // 1 to 8 (number of quantized voltage slice steps)
  mix = 0.85;      // 0 to 1 (wet/dry blend amount)

  private lutLow: [number, number, number] = [0, 0, 0];
  private lutMid: [number, number, number] = [0, 0, 0];
  private lutHigh: [number, number, number] = [0, 0, 0];
  private colorLutR = new Uint8Array(256);
  private colorLutG = new Uint8Array(256);
  private colorLutB = new Uint8Array(256);

  constructor() {
    super();
    this.updateLuts();
  }

  private updateLuts(): void {
    this.lutLow = hsvToRgb(this.lowHue, 0.85, 0.7);
    this.lutMid = hsvToRgb(this.midHue, 0.9, 0.9);
    this.lutHigh = hsvToRgb(this.highHue, 0.85, 1.0);

    const [rLow, gLow, bLow] = this.lutLow;
    const [rMid, gMid, bMid] = this.lutMid;
    const [rHigh, gHigh, bHigh] = this.lutHigh;

    const numBands = this.bands;
    const bandStep = 255 / (numBands > 1 ? numBands - 1 : 1);

    for (let rawLuma = 0; rawLuma < 256; rawLuma++) {
      let luma = rawLuma;
      if (numBands < 8) {
        luma = Math.round(Math.round(luma / bandStep) * bandStep);
      }

      let cR = 0, cG = 0, cB = 0;
      if (luma < 128) {
        const factor = luma / 128.0;
        const invFactor = 1.0 - factor;
        cR = (rLow * invFactor + rMid * factor) | 0;
        cG = (gLow * invFactor + gMid * factor) | 0;
        cB = (bLow * invFactor + bMid * factor) | 0;
      } else {
        const factor = (luma - 128) / 127.0;
        const invFactor = 1.0 - factor;
        cR = (rMid * invFactor + rHigh * factor) | 0;
        cG = (gMid * invFactor + gHigh * factor) | 0;
        cB = (bMid * invFactor + bHigh * factor) | 0;
      }

      this.colorLutR[rawLuma] = cR;
      this.colorLutG[rawLuma] = cG;
      this.colorLutB[rawLuma] = cB;
    }
  }

  randomize(): void {
    this.lowHue = Math.round(Math.random() * 360);
    this.midHue = Math.round(Math.random() * 360);
    this.highHue = Math.round(Math.random() * 360);
    this.bands = Math.floor(2 + Math.random() * 6);
    this.mix = +(0.5 + Math.random() * 0.5).toFixed(2);
    this.updateLuts();
  }

  setParams(p: Record<string, number>): void {
    let changed = false;
    if (p.lowHue !== undefined) {
      const v = clamp(p.lowHue, 0, 360);
      if (v !== this.lowHue) { this.lowHue = v; changed = true; }
    }
    if (p.midHue !== undefined) {
      const v = clamp(p.midHue, 0, 360);
      if (v !== this.midHue) { this.midHue = v; changed = true; }
    }
    if (p.highHue !== undefined) {
      const v = clamp(p.highHue, 0, 360);
      if (v !== this.highHue) { this.highHue = v; changed = true; }
    }
    if (p.bands !== undefined) {
      const v = clamp(Math.round(p.bands), 1, 8);
      if (v !== this.bands) { this.bands = v; changed = true; }
    }
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
    if (changed) this.updateLuts();
  }

  getParams(): Record<string, number> {
    return {
      lowHue: this.lowHue,
      midHue: this.midHue,
      highHue: this.highHue,
      bands: this.bands,
      mix: this.mix,
    };
  }

  getPackedColorLut(): Uint32Array {
    const packed=new Uint32Array(256);
    for(let i=0;i<256;i++)packed[i]=this.colorLutR[i]|(this.colorLutG[i]<<8)|(this.colorLutB[i]<<16);
    return packed;
  }

  processFrame(rgba: Uint8ClampedArray, _ctx: VideoFrameContext): void {
    const len = rgba.length;
    const wet = this.mix;
    const dry = 1.0 - wet;
    const lutR = this.colorLutR;
    const lutG = this.colorLutG;
    const lutB = this.colorLutB;

    for (let i = 0; i < len; i += 4) {
      const origR = rgba[i];
      const origG = rgba[i + 1];
      const origB = rgba[i + 2];

      const luma = (origR * 77 + origG * 150 + origB * 29) >> 8;

      rgba[i] = (origR * dry + lutR[luma] * wet + 0.5) | 0;
      rgba[i + 1] = (origG * dry + lutG[luma] * wet + 0.5) | 0;
      rgba[i + 2] = (origB * dry + lutB[luma] * wet + 0.5) | 0;
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'colorizer',
    name: 'Paik/Jones Colorizer',
    category: 'color',
    description: 'Analog video synthesizer colorizer: slices luminance into voltage bands and applies RGB tints.',
    params: [
      { name: 'lowHue', label: 'Shadow Hue', type: 'float', min: 0, max: 360, step: 1, value: 210, tooltip: 'Tint color for dark shadow voltages (0-360°)' },
      { name: 'midHue', label: 'Midtone Hue', type: 'float', min: 0, max: 360, step: 1, value: 35, tooltip: 'Tint color for midtone voltages (0-360°)' },
      { name: 'highHue', label: 'Highlight Hue', type: 'float', min: 0, max: 360, step: 1, value: 85, tooltip: 'Tint color for bright highlight voltages (0-360°)' },
      { name: 'bands', label: 'Voltage Bands', type: 'int', min: 1, max: 8, step: 1, value: 4, tooltip: 'Quantized luminance voltage slice levels' },
      { name: 'mix', label: 'Wet Mix', type: 'float', min: 0, max: 1, step: 0.05, value: 0.85, tooltip: 'Wet / dry blend amount' },
    ],
  },
  create: () => new ColorizerFilter(),
};
