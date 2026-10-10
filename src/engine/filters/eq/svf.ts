import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 2. State-Variable Multi-Mode Filter (Andrew Simper / Chamberlin SVF)
// In audio: 12dB/oct multi-mode filter with smooth continuous morphing between LP -> BP -> HP -> Notch.
// In video: morphing from color blur/diffusion (LP) to edge detection/sharpening (HP).
export class SvfFilter extends BaseDspFilter {
  cutoff = 1500.0;   // Hz (20 to 18000)
  res = 2.0;         // Q factor (0.5 to 10)
  mode = 0;          // 0 = Lowpass, 1 = Bandpass, 2 = Highpass, 3 = Notch (continuous)

  private ic1eq = 0.0;
  private ic2eq = 0.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.ic1eq = 0.0;
    this.ic2eq = 0.0;
  }

  randomize(): void {
    this.cutoff = 100 + Math.random() * 8000;
    this.res = 0.7 + Math.random() * 6;
    this.mode = Math.random() * 3;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.cutoff !== undefined) this.cutoff = clamp(p.cutoff, 20, 18000);
    if (p.res !== undefined) this.res = clamp(p.res, 0.5, 10);
    if (p.mode !== undefined) this.mode = clamp(p.mode, 0, 3);
  }

  getParams(): Record<string, number> {
    return {
      cutoff: this.cutoff,
      res: this.res,
      mode: this.mode,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const fs = this.sampleRate;
    const fc = clamp(this.cutoff, 20, fs * 0.48);
    const g = Math.tan((Math.PI * fc) / fs);
    const k = 1.0 / this.res;
    const a1 = 1.0 / (1.0 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;

    const m = this.mode;
    let s1 = this.ic1eq;
    let s2 = this.ic2eq;

    for (let i = 0; i < len; i++) {
      const v0 = samples[i];
      const v3 = v0 - s2;
      const v1 = a1 * s1 + a2 * v3;
      const v2 = s2 + a2 * s1 + a3 * v3;
      s1 = 2.0 * v1 - s1;
      s2 = 2.0 * v2 - s2;

      const lp = v2;
      const bp = v1;
      const hp = v0 - k * v1 - v2;
      const notch = hp + lp;

      // Morph between LP(0) -> BP(1) -> HP(2) -> Notch(3)
      let out = 0;
      if (m <= 1.0) {
        out = lp * (1.0 - m) + bp * m;
      } else if (m <= 2.0) {
        const t = m - 1.0;
        out = bp * (1.0 - t) + hp * t;
      } else {
        const t = m - 2.0;
        out = hp * (1.0 - t) + notch * t;
      }

      samples[i] = out !== out ? 0 : out;
    }

    this.ic1eq = s1;
    this.ic2eq = s2;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'svf',
    name: 'State Variable Filter',
    category: 'eq',
    description: 'Multi-mode 12dB/oct filter morphing from Lowpass to Bandpass, Highpass & Notch.',
    defaultSampleRate: 44100,
    params: [
      { name: 'cutoff', label: 'Cutoff (Hz)', type: 'float', min: 20, max: 18000, step: 50, value: 1500, tooltip: 'State-variable corner frequency' },
      { name: 'res', label: 'Q Res', type: 'float', min: 0.5, max: 10, step: 0.25, value: 2.0, tooltip: 'Filter resonance sharpness (Q)' },
      { name: 'mode', label: 'Mode (LP-BP-HP-N)', type: 'float', min: 0, max: 3, step: 0.1, value: 0.0, tooltip: 'Filter mode morph: 0=Lowpass, 1=Bandpass, 2=Highpass, 3=Notch' },
    ],
  },
  create: (sr) => new SvfFilter(sr),
};
