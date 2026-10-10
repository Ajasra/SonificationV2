import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 21. Randmix: Random impulse response history filter
export class RandmixFilter extends BaseDspFilter {
  tail = 10;
  private prev = new Float32Array(64);
  private w = new Float32Array(64);
  private idx = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.idx = 0;
    this.prev.fill(0);
    let sum = 0;
    for (let i = 0; i < this.tail; i++) {
      this.w[i] = Math.sqrt(Math.random());
      sum += this.w[i];
    }
    const invSum = sum > 0 ? 1.0 / sum : 1.0;
    for (let i = 0; i < this.tail; i++) {
      this.w[i] *= invSum;
    }
  }

  randomize(): void {
    this.tail = Math.floor(5 + Math.random() * 25);
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.tail !== undefined) this.tail = Math.min(64, Math.max(2, Math.floor(p.tail)));
    this.init();
  }

  getParams(): Record<string, number> {
    return { tail: this.tail };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const tail = this.tail;
    const prev = this.prev;
    const w = this.w;
    let idx = this.idx;

    for (let i = 0; i < len; i++) {
      prev[idx] = samples[i];
      let s = 0;
      let pIdx = idx;
      for (let j = 0; j < tail; j++) {
        s += prev[pIdx] * w[j];
        if (--pIdx < 0) pIdx = tail - 1;
      }
      prev[idx] = s;
      if (++idx >= tail) idx = 0;
      samples[i] = s !== s ? 0 : s;
    }
    this.idx = idx;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'randmix',
    name: 'Randmix FIR',
    category: 'distortion',
    description: 'Randomized impulse response history filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'tail', label: 'Tail Length', type: 'int', min: 2, max: 40, step: 1, value: 10, tooltip: 'Sample history window size for randomized diffusion' },
    ],
  },
  create: (sr) => new RandmixFilter(sr),
};
