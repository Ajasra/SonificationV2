import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// Downward Expander: gentler than a gate; signal below the threshold is reduced by the ratio.
export class ExpanderFilter extends BaseDspFilter {
  threshold = -40;   // dB
  ratio = 2.5;
  attack = 2;        // ms
  release = 150;     // ms

  private env = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.env = 0;
  }

  randomize(): void {
    this.threshold = -60 + Math.random() * 40;
    this.ratio = 1.5 + Math.random() * 5;
    this.attack = 0.5 + Math.random() * 10;
    this.release = 50 + Math.random() * 400;
  }

  setParams(p: Record<string, number>): void {
    if (p.threshold !== undefined) this.threshold = clamp(p.threshold, -80, 0);
    if (p.ratio !== undefined) this.ratio = clamp(p.ratio, 1, 10);
    if (p.attack !== undefined) this.attack = clamp(p.attack, 0.1, 50);
    if (p.release !== undefined) this.release = clamp(p.release, 5, 1000);
  }

  getParams(): Record<string, number> {
    return { threshold: this.threshold, ratio: this.ratio, attack: this.attack, release: this.release };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const att = Math.exp(-1 / ((this.attack / 1000) * sr));
    const rel = Math.exp(-1 / ((this.release / 1000) * sr));
    const thresh = this.threshold;
    const slope = this.ratio - 1;
    let env = this.env;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      const a = Math.abs(x);
      env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
      const envDb = 20 * Math.log10(Math.max(1e-6, env));
      const gainDb = envDb < thresh ? Math.max(-80, (envDb - thresh) * slope) : 0;
      samples[i] = x * Math.pow(10, gainDb / 20);
    }

    this.env = env;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'expander',
    name: 'Downward Expander',
    category: 'dynamics',
    description: 'Smoothly lowers quiet signal below the threshold; gentler than a noise gate.',
    defaultSampleRate: 44100,
    params: [
      { name: 'threshold', label: 'Threshold (dB)', type: 'float', min: -80, max: 0, step: 1, value: -40, tooltip: 'Level below which expansion starts' },
      { name: 'ratio', label: 'Ratio', type: 'float', min: 1, max: 10, step: 0.1, value: 2.5, tooltip: 'Expansion strength (1 = off)' },
      { name: 'attack', label: 'Attack (ms)', type: 'float', min: 0.1, max: 50, step: 0.1, value: 2, tooltip: 'Opening speed' },
      { name: 'release', label: 'Release (ms)', type: 'float', min: 5, max: 1000, step: 5, value: 150, tooltip: 'Closing speed' },
    ],
  },
  create: (sr) => new ExpanderFilter(sr),
};
