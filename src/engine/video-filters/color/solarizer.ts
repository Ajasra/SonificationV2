import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp, clampByte } from '../util.ts';

// 3. Sabbatier / Photochemical Solarizer
// Applies non-linear parabolic and threshold folding to luminance and chrominance,
// simulating darkroom pseudo-solarization and metallic specular silvering.
export class SolarizerFilter extends BaseVideoFilter {
  threshold = 128;   // 20 to 240 (voltage folding inflection knee point)
  gamma = 1.4;       // 0.4 to 3.0 (curvature of the solarization transfer function)
  pedestal = 10;     // -50 to 50 (black level DC pedestal offset)
  invert = 1;        // 0 or 1 (whether folded values are inverted downwards)

  private lut = new Uint8Array(256);

  constructor() {
    super();
    this.updateLut();
  }

  private updateLut(): void {
    const thresh = this.threshold;
    const g = this.gamma;
    const ped = this.pedestal;
    const inv = this.invert > 0.5;

    for (let i = 0; i < 256; i++) {
      let v: number;
      if (i < thresh) {
        // Shadow ramp
        const norm = i / thresh;
        v = Math.pow(norm, g) * thresh;
      } else {
        // Highlight solarization fold
        const norm = (i - thresh) / (255 - thresh);
        if (inv) {
          v = thresh - Math.pow(norm, 1.0 / g) * thresh;
        } else {
          v = 255 - Math.pow(norm, g) * (255 - thresh);
        }
      }
      this.lut[i] = clampByte(v + ped);
    }
  }

  randomize(): void {
    this.threshold = Math.round(60 + Math.random() * 140);
    this.gamma = +(0.6 + Math.random() * 1.8).toFixed(2);
    this.pedestal = Math.round(-20 + Math.random() * 40);
    this.invert = Math.random() > 0.3 ? 1 : 0;
    this.updateLut();
  }

  setParams(p: Record<string, number>): void {
    if (p.threshold !== undefined) this.threshold = clamp(p.threshold, 20, 240);
    if (p.gamma !== undefined) this.gamma = clamp(p.gamma, 0.4, 3.0);
    if (p.pedestal !== undefined) this.pedestal = clamp(p.pedestal, -50, 50);
    if (p.invert !== undefined) this.invert = clamp(p.invert, 0, 1);
    this.updateLut();
  }

  getParams(): Record<string, number> {
    return {
      threshold: this.threshold,
      gamma: this.gamma,
      pedestal: this.pedestal,
      invert: this.invert,
    };
  }

  processFrame(rgba: Uint8ClampedArray, _ctx: VideoFrameContext): void {
    const len = rgba.length;
    const lut = this.lut;

    for (let i = 0; i < len; i += 4) {
      rgba[i] = lut[rgba[i]];
      rgba[i + 1] = lut[rgba[i + 1]];
      rgba[i + 2] = lut[rgba[i + 2]];
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'solarizer',
    name: 'Sabbatier Solarizer',
    category: 'color',
    description: 'Darkroom & analog video pseudo-solarization: parabolic voltage folding producing metallic silver edges.',
    params: [
      { name: 'threshold', label: 'Fold Knee', type: 'int', min: 20, max: 240, step: 2, value: 128, tooltip: 'Voltage inflection point where solarization begins' },
      { name: 'gamma', label: 'Curve Gamma', type: 'float', min: 0.4, max: 3.0, step: 0.1, value: 1.4, tooltip: 'Curvature and steepness of the transfer curve' },
      { name: 'pedestal', label: 'Pedestal', type: 'int', min: -50, max: 50, step: 1, value: 10, tooltip: 'Black level DC voltage bias offset' },
      { name: 'invert', label: 'Fold Invert', type: 'bool', min: 0, max: 1, step: 1, value: 1, tooltip: 'Invert folded highlights downward into shadows' },
    ],
  },
  create: () => new SolarizerFilter(),
};
