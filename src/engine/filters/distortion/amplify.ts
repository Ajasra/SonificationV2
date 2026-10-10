import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 22. AuAmplify: Gain amplifier
export class AuAmplifyFilter extends BaseDspFilter {
  amp = 1.0; // multiplier

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
  }

  init(): void {}

  randomize(): void {
    this.amp = 0.1 + Math.random() * 5.0;
  }

  setParams(p: Record<string, number>): void {
    if (p.amp !== undefined) this.amp = p.amp;
  }

  getParams(): Record<string, number> {
    return { amp: this.amp };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const a = this.amp;
    for (let i = 0; i < len; i++) {
      samples[i] *= a;
    }
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'amplify',
    name: 'Amplify',
    category: 'distortion',
    description: 'Linear gain multiplier.',
    defaultSampleRate: 44100,
    params: [
      { name: 'amp', label: 'Gain Multiplier', type: 'float', min: 0.1, max: 10, step: 0.1, value: 1.0, tooltip: 'Linear output gain amplification factor' },
    ],
  },
  create: (sr) => new AuAmplifyFilter(sr),
};
