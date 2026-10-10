import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// Tape Saturation: biased soft-clip, low "head bump" and HF roll-off.
export class TapeSaturationFilter extends BaseDspFilter {
  drive = 2.5;
  bias = 0.1;
  bump = 0.4;
  bumpHz = 80;
  tone = 8000;

  private bumpLp = 0;
  private toneLp = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.bumpLp = 0;
    this.toneLp = 0;
  }

  randomize(): void {
    this.drive = 1 + Math.random() * 6;
    this.bias = Math.random() * 0.3;
    this.bump = Math.random() * 0.8;
    this.bumpHz = 50 + Math.random() * 120;
    this.tone = 3000 + Math.random() * 10000;
  }

  setParams(p: Record<string, number>): void {
    if (p.drive !== undefined) this.drive = clamp(p.drive, 1, 10);
    if (p.bias !== undefined) this.bias = clamp(p.bias, -0.5, 0.5);
    if (p.bump !== undefined) this.bump = clamp(p.bump, 0, 1);
    if (p.bumpHz !== undefined) this.bumpHz = clamp(p.bumpHz, 40, 200);
    if (p.tone !== undefined) this.tone = clamp(p.tone, 1000, 18000);
  }

  getParams(): Record<string, number> {
    return { drive: this.drive, bias: this.bias, bump: this.bump, bumpHz: this.bumpHz, tone: this.tone };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const drv = this.drive;
    const bias = this.bias;
    const dcOffset = Math.tanh(drv * bias);
    const norm = 1 / Math.max(0.2, Math.tanh(drv));
    const bumpA = 1 - Math.exp((-2 * Math.PI * this.bumpHz) / this.sampleRate);
    const toneA = 1 - Math.exp((-2 * Math.PI * Math.min(this.tone, this.sampleRate * 0.45)) / this.sampleRate);
    const bump = this.bump;
    let bl = this.bumpLp;
    let tl = this.toneLp;

    for (let i = 0; i < len; i++) {
      let y = (Math.tanh(drv * (samples[i] + bias)) - dcOffset) * norm;
      bl += bumpA * (y - bl);
      y += bump * bl;
      tl += toneA * (y - tl);
      samples[i] = tl;
    }

    this.bumpLp = bl;
    this.toneLp = tl;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'tapesat',
    name: 'Tape Saturation',
    category: 'lofi',
    description: 'Biased tape soft-clip with low head-bump and high-frequency roll-off.',
    defaultSampleRate: 44100,
    params: [
      { name: 'drive', label: 'Drive', type: 'float', min: 1, max: 10, step: 0.1, value: 2.5, tooltip: 'Input level driving the tape saturation' },
      { name: 'bias', label: 'Bias', type: 'float', min: -0.5, max: 0.5, step: 0.01, value: 0.1, tooltip: 'Asymmetry, adds even harmonics' },
      { name: 'bump', label: 'Head Bump', type: 'float', min: 0, max: 1, step: 0.05, value: 0.4, tooltip: 'Low-frequency resonance boost' },
      { name: 'bumpHz', label: 'Bump (Hz)', type: 'float', min: 40, max: 200, step: 5, value: 80, tooltip: 'Head bump frequency' },
      { name: 'tone', label: 'Tone (Hz)', type: 'float', min: 1000, max: 18000, step: 100, value: 8000, tooltip: 'High-frequency roll-off' },
    ],
  },
  create: (sr) => new TapeSaturationFilter(sr),
};
