import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 2. Ducker / Sidechain Pump: an internal clock rhythmically ducks the signal.
export class DuckerFilter extends BaseDspFilter {
  rate = 2.0;      // Hz
  depth = 0.8;
  shape = 0;       // 0=Pump 1=Sine 2=Gate

  private phase = 0;
  private gain = 1;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.phase = 0;
    this.gain = 1;
  }

  randomize(): void {
    this.rate = 0.5 + Math.random() * 8;
    this.depth = 0.4 + Math.random() * 0.6;
    this.shape = Math.floor(Math.random() * 3);
  }

  setParams(p: Record<string, number>): void {
    if (p.rate !== undefined) this.rate = clamp(p.rate, 0.1, 20);
    if (p.depth !== undefined) this.depth = clamp(p.depth, 0, 1);
    if (p.shape !== undefined) this.shape = clamp(Math.round(p.shape), 0, 2);
  }

  getParams(): Record<string, number> {
    return { rate: this.rate, depth: this.depth, shape: this.shape };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const inc = this.rate / this.sampleRate;
    const depth = this.depth;
    const shape = this.shape;
    const smooth = 1 - Math.exp(-1 / (0.002 * this.sampleRate));
    let ph = this.phase;
    let g = this.gain;

    for (let i = 0; i < len; i++) {
      let duck: number; // 1 = fully ducked
      if (shape === 0) {
        const r = 1 - ph;
        duck = r * r;
      } else if (shape === 1) {
        duck = 0.5 + 0.5 * Math.cos(2 * Math.PI * ph);
      } else {
        duck = ph < 0.5 ? 1 : 0;
      }
      g += ((1 - depth * duck) - g) * smooth;
      ph += inc;
      if (ph >= 1) ph -= 1;
      samples[i] *= g;
    }

    this.phase = ph;
    this.gain = g;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'ducker',
    name: 'Ducker / Pump',
    category: 'dynamics',
    description: 'Internal clock rhythmically ducks the signal for sidechain-style pumping.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (Hz)', type: 'float', min: 0.1, max: 20, step: 0.1, value: 2, tooltip: 'Pump rate' },
      { name: 'depth', label: 'Depth', type: 'float', min: 0, max: 1, step: 0.05, value: 0.8, tooltip: 'Amount of gain reduction' },
      { name: 'shape', label: 'Shape', type: 'int', min: 0, max: 2, step: 1, value: 0, tooltip: '0=Pump, 1=Sine, 2=Gate' },
    ],
  },
  create: (sr) => new DuckerFilter(sr),
};
