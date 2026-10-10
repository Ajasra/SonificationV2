import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 17. VacuumTubeAmp: Nonlinear digital vacuum tube transfer curve
export class VacuumTubeAmpFilter extends BaseDspFilter {
  rangeA = -0.5;
  rangeB = 0.5;

  private k1 = 0;
  private k2 = 0;
  private k3 = 0;
  private k4 = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.k1 = this.rangeA * this.rangeA;
    this.k2 = 1 + this.rangeA + this.rangeA;
    this.k3 = this.rangeB * this.rangeB;
    this.k4 = 1 - (this.rangeB + this.rangeB);
  }

  randomize(): void {
    this.rangeA = -1 + Math.random() * 1.9;
    this.rangeB = this.rangeA + 0.0001 + Math.random() * (1 - (this.rangeA + 0.0001));
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.rangeA !== undefined) this.rangeA = p.rangeA;
    if (p.rangeB !== undefined) this.rangeB = p.rangeB;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      rangeA: this.rangeA,
      rangeB: this.rangeB,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const rA = this.rangeA;
    const rB = this.rangeB;
    const k1 = this.k1;
    const k2 = this.k2;
    const k3 = this.k3;
    const k4 = this.k4;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      let out = x;
      if (x < rA) {
        out = (k1 + x) / Math.max(1e-6, k2 - x);
      } else if (x > rB) {
        out = (x - k3) / Math.max(1e-6, x + k4);
      }
      samples[i] = out !== out ? 0 : out;
    }
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'vacuum',
    name: 'Vacuum Tube Amp',
    category: 'distortion',
    description: 'Analog vacuum tube saturation curve.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rangeA', label: 'Negative Knee', type: 'float', min: -0.99, max: -0.1, step: 0.01, value: -0.5, tooltip: 'Negative signal saturation threshold' },
      { name: 'rangeB', label: 'Positive Knee', type: 'float', min: 0.1, max: 0.99, step: 0.01, value: 0.5, tooltip: 'Positive signal saturation threshold' },
    ],
  },
  create: (sr) => new VacuumTubeAmpFilter(sr),
};
