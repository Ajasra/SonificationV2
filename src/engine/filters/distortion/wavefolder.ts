import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 2. West-Coast Wavefolder (Buchla / Serge style nonlinear wavefolder)
// In audio: folds overdriven peaks back downwards repeatedly, generating rich odd/even overtone cascades.
// In video: psychedelic color folding, transforming bright highlights into inverted complementary colors and zebra contours.
export class WavefolderFilter extends BaseDspFilter {
  drive = 2.5;       // 1 to 10
  folds = 3;         // 1 to 6
  symmetry = 0.0;    // -1 to 1 (DC bias asymmetry)

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {}

  randomize(): void {
    this.drive = 1.5 + Math.random() * 6;
    this.folds = Math.floor(1 + Math.random() * 5);
    this.symmetry = -0.3 + Math.random() * 0.6;
  }

  setParams(p: Record<string, number>): void {
    if (p.drive !== undefined) this.drive = clamp(p.drive, 1, 10);
    if (p.folds !== undefined) this.folds = clamp(Math.round(p.folds), 1, 6);
    if (p.symmetry !== undefined) this.symmetry = clamp(p.symmetry, -1, 1);
  }

  getParams(): Record<string, number> {
    return {
      drive: this.drive,
      folds: this.folds,
      symmetry: this.symmetry,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const drv = this.drive;
    const sym = this.symmetry;
    const numFolds = this.folds;

    for (let i = 0; i < len; i++) {
      // Apply drive and DC asymmetry
      let s = (samples[i] + sym) * drv;

      // Iterative triangle wavefolding
      for (let f = 0; f < numFolds; f++) {
        if (s > 1.0) {
          s = 2.0 - s;
        } else if (s < -1.0) {
          s = -2.0 - s;
        }
      }

      // Smooth soft rational tanh limiter on final output
      if (s < -3.0) {
        samples[i] = -1.0;
      } else if (s > 3.0) {
        samples[i] = 1.0;
      } else {
        const s2 = s * s;
        samples[i] = (s * (27.0 + s2)) / (27.0 + 9.0 * s2);
      }
    }
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'wavefolder',
    name: 'Buchla Wavefolder',
    category: 'distortion',
    description: 'West-Coast nonlinear wavefolder creating harmonic brilliance and psychedelic color folds.',
    defaultSampleRate: 44100,
    params: [
      { name: 'drive', label: 'Drive', type: 'float', min: 1, max: 10, step: 0.2, value: 2.5, tooltip: 'Input amplification driving the folding diodes' },
      { name: 'folds', label: 'Folds', type: 'int', min: 1, max: 6, step: 1, value: 3, tooltip: 'Number of cascading wave fold stages' },
      { name: 'symmetry', label: 'Symmetry', type: 'float', min: -1, max: 1, step: 0.05, value: 0.0, tooltip: 'DC bias offsetting even vs odd harmonics' },
    ],
  },
  create: (sr) => new WavefolderFilter(sr),
};
