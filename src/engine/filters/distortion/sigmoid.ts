import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { fastSigmoid } from '../../fast-lut.ts';

// 18. TapSigmoid: Sigmoid soft saturation curve
export class TapSigmoidFilter extends BaseDspFilter {
  fact = -5.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
  }

  init(): void {}

  randomize(): void {
    this.fact = -10 + Math.random() * 9;
  }

  setParams(p: Record<string, number>): void {
    if (p.fact !== undefined) this.fact = p.fact;
  }

  getParams(): Record<string, number> {
    return { fact: this.fact };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    for (let i = 0; i < len; i++) {
      samples[i] = fastSigmoid(samples[i]);
    }
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'sigmoid',
    name: 'Sigmoid Overdrive',
    category: 'distortion',
    description: 'Soft sigmoid overdrive saturation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'fact', label: 'Factor', type: 'float', min: -10, max: -1, step: 0.1, value: -5, tooltip: 'Overdrive saturation curvature amount' },
    ],
  },
  create: (sr) => new TapSigmoidFilter(sr),
};
