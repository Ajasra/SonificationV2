import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// S&H Random Filter: a sample-and-hold LFO picks random cutoffs for a resonant lowpass, with adjustable slew.
export class SampleHoldFilter extends BaseDspFilter {
  rate = 4;
  depth = 0.8;
  base = 400;
  q = 4;
  slew = 30;       // ms

  private low = 0;
  private band = 0;
  private phase = 1;
  private target = 0;   // log2 offset (octaves)
  private current = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.low = 0;
    this.band = 0;
    this.phase = 1;
    this.target = 0;
    this.current = 0;
  }

  randomize(): void {
    this.rate = 1 + Math.random() * 12;
    this.depth = 0.4 + Math.random() * 0.6;
    this.base = 150 + Math.random() * 1500;
    this.q = 1 + Math.random() * 8;
    this.slew = Math.random() * 120;
  }

  setParams(p: Record<string, number>): void {
    if (p.rate !== undefined) this.rate = clamp(p.rate, 0.5, 20);
    if (p.depth !== undefined) this.depth = clamp(p.depth, 0, 1);
    if (p.base !== undefined) this.base = clamp(p.base, 100, 4000);
    if (p.q !== undefined) this.q = clamp(p.q, 0.7, 12);
    if (p.slew !== undefined) this.slew = clamp(p.slew, 0, 500);
  }

  getParams(): Record<string, number> {
    return { rate: this.rate, depth: this.depth, base: this.base, q: this.q, slew: this.slew };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const inc = this.rate / sr;
    const slewA = this.slew <= 0 ? 1 : 1 - Math.exp(-1 / ((this.slew / 1000) * sr));
    const damp = 1 / this.q;
    const range = this.depth * 4; // octaves
    let low = this.low, band = this.band, ph = this.phase, target = this.target, cur = this.current;

    for (let i = 0; i < len; i++) {
      ph += inc;
      if (ph >= 1) {
        ph -= 1;
        target = Math.random() * range;
      }
      cur += (target - cur) * slewA;

      const fc = Math.min(this.base * Math.pow(2, cur), sr * 0.4);
      const f = Math.min(1.2, 2 * Math.sin((Math.PI * fc) / sr));
      const x = samples[i];
      low += f * band;
      const high = x - low - damp * band;
      band += f * high;
      samples[i] = low !== low || Math.abs(low) > 8 ? 0 : low;
    }

    this.low = low; this.band = band; this.phase = ph; this.target = target; this.current = cur;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'shrandom',
    name: 'S&H Random Filter',
    category: 'synth',
    description: 'Sample-and-hold random cutoff steps on a resonant lowpass, with slew.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (Hz)', type: 'float', min: 0.5, max: 20, step: 0.5, value: 4, tooltip: 'Steps per second' },
      { name: 'depth', label: 'Depth', type: 'float', min: 0, max: 1, step: 0.05, value: 0.8, tooltip: 'Random cutoff range (up to 4 octaves)' },
      { name: 'base', label: 'Base (Hz)', type: 'float', min: 100, max: 4000, step: 10, value: 400, tooltip: 'Lowest cutoff' },
      { name: 'q', label: 'Q', type: 'float', min: 0.7, max: 12, step: 0.1, value: 4, tooltip: 'Resonance' },
      { name: 'slew', label: 'Slew (ms)', type: 'float', min: 0, max: 500, step: 5, value: 30, tooltip: 'Glide between steps' },
    ],
  },
  create: (sr) => new SampleHoldFilter(sr),
};
