import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// Telephone / Radio: 12 dB/oct band-limiting, mild clipping, noise bed and crackle pops.
export class TelephoneFilter extends BaseDspFilter {
  lowCut = 300;
  highCut = 3400;
  noise = 0.05;
  crackle = 0.2;

  private hp1 = 0;
  private hp2 = 0;
  private lp1 = 0;
  private lp2 = 0;
  private pop = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.hp1 = this.hp2 = this.lp1 = this.lp2 = this.pop = 0;
  }

  randomize(): void {
    this.lowCut = 150 + Math.random() * 600;
    this.highCut = 2000 + Math.random() * 4000;
    this.noise = Math.random() * 0.2;
    this.crackle = Math.random() * 0.6;
  }

  setParams(p: Record<string, number>): void {
    if (p.lowCut !== undefined) this.lowCut = clamp(p.lowCut, 50, 1000);
    if (p.highCut !== undefined) this.highCut = clamp(p.highCut, 1500, 8000);
    if (p.noise !== undefined) this.noise = clamp(p.noise, 0, 1);
    if (p.crackle !== undefined) this.crackle = clamp(p.crackle, 0, 1);
  }

  getParams(): Record<string, number> {
    return { lowCut: this.lowCut, highCut: this.highCut, noise: this.noise, crackle: this.crackle };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const hpA = 1 - Math.exp((-2 * Math.PI * this.lowCut) / sr); // low-pass state for HP subtraction
    const lpA = 1 - Math.exp((-2 * Math.PI * Math.min(this.highCut, sr * 0.45)) / sr);
    const popProb = (this.crackle * 25) / sr;
    const noise = this.noise;
    let h1 = this.hp1, h2 = this.hp2, l1 = this.lp1, l2 = this.lp2, pop = this.pop;

    for (let i = 0; i < len; i++) {
      let x = samples[i];
      h1 += hpA * (x - h1); x -= h1;
      h2 += hpA * (x - h2); x -= h2;
      l1 += lpA * (x - l1);
      l2 += lpA * (l1 - l2);
      x = Math.tanh(l2 * 1.5);

      if (Math.random() < popProb) pop = (Math.random() * 2 - 1) * 0.6;
      pop *= 0.92;
      samples[i] = x + pop + (Math.random() * 2 - 1) * noise * 0.1;
    }

    this.hp1 = h1; this.hp2 = h2; this.lp1 = l1; this.lp2 = l2; this.pop = pop;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'telephone',
    name: 'Telephone / Radio',
    category: 'lofi',
    description: 'Narrow band-limited voice sound with mild clipping, noise bed and crackle.',
    defaultSampleRate: 44100,
    params: [
      { name: 'lowCut', label: 'Low Cut (Hz)', type: 'float', min: 50, max: 1000, step: 10, value: 300, tooltip: 'High-pass corner' },
      { name: 'highCut', label: 'High Cut (Hz)', type: 'float', min: 1500, max: 8000, step: 50, value: 3400, tooltip: 'Low-pass corner' },
      { name: 'noise', label: 'Noise', type: 'float', min: 0, max: 1, step: 0.05, value: 0.05, tooltip: 'Line noise level' },
      { name: 'crackle', label: 'Crackle', type: 'float', min: 0, max: 1, step: 0.05, value: 0.2, tooltip: 'Random pop density' },
    ],
  },
  create: (sr) => new TelephoneFilter(sr),
};
