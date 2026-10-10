import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 20. TShiftR: Square root feedback fold distortion
export class TShiftRFilter extends BaseDspFilter {
  mPasses = 5;
  mDiv = 1.0;
  private prev = 0.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.prev = 0.0;
  }

  randomize(): void {
    this.mPasses = Math.floor(1 + Math.random() * 10);
    this.mDiv = 0.5 + Math.random() * 4.5;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.mPasses !== undefined) this.mPasses = Math.max(1, Math.floor(p.mPasses));
    if (p.mDiv !== undefined) this.mDiv = p.mDiv;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      mPasses: this.mPasses,
      mDiv: this.mDiv,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const passes = this.mPasses;
    const div = this.mDiv;

    for (let i = 0; i < len; i++) {
      const inVal = samples[i];
      let out = inVal;
      for (let p = 0; p < passes; p++) {
        const arg = (out + this.prev) / (inVal * div);
        out = arg < 1e-10 ? 0.0 : Math.sqrt(Math.abs(arg));
      }
      this.prev = inVal;
      samples[i] = out !== out ? 0 : out;
    }
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'shiftr',
    name: 'TShiftR Fold',
    category: 'distortion',
    description: 'Square root feedback fold distortion.',
    defaultSampleRate: 44100,
    params: [
      { name: 'mPasses', label: 'Passes', type: 'int', min: 1, max: 10, step: 1, value: 5, tooltip: 'Number of wave folding iterations' },
      { name: 'mDiv', label: 'Divisor', type: 'float', min: 0.5, max: 5, step: 0.1, value: 1, tooltip: 'Folding amplitude normalization scaling' },
    ],
  },
  create: (sr) => new TShiftRFilter(sr),
};
