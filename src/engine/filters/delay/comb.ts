import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 4. Comb: Feedback comb filter with cubic interpolation (LADSPA comb_1190)
export class CombFilter extends BaseDspFilter {
  freq = 100;
  feedback = 0.1;

  private static readonly COMB_SIZE = 0x4000; // 16384 (power of 2)
  private static readonly COMB_MASK = 0x3fff;

  private buffer = new Float32Array(CombFilter.COMB_SIZE);
  private pos = 0;
  private offset = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.buffer.fill(0);
    this.pos = 0;
    this.offset = clamp(this.sampleRate / this.freq, 0, CombFilter.COMB_MASK);
  }

  randomize(): void {
    this.freq = 16 + Math.random() * 624;
    this.feedback = -1 + Math.random() * 2;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = p.freq;
    if (p.feedback !== undefined) this.feedback = p.feedback;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      freq: this.freq,
      feedback: this.feedback,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const buf = this.buffer;
    const mask = CombFilter.COMB_MASK;
    const fb = this.feedback;
    const ofs = this.offset;
    let pos = this.pos;

    // Precompute constant offset and cubic polynomial weights for the block
    const ofsInt = Math.floor(ofs);
    const fr = ofs - ofsInt;
    const w0 = 0.5 * fr * (-1.0 + fr * (2.0 - fr));
    const w1 = 1.0 + 0.5 * fr * fr * (3.0 * fr - 5.0);
    const w2 = 0.5 * fr * (1.0 + fr * (4.0 - 3.0 * fr));
    const w3 = 0.5 * fr * fr * (fr - 1.0);

    for (let i = 0; i < len; i++) {
      const dataPos = pos - ofsInt;
      const interp =
        w0 * buf[(dataPos - 1) & mask] +
        w1 * buf[dataPos & mask] +
        w2 * buf[(dataPos + 1) & mask] +
        w3 * buf[(dataPos + 2) & mask];

      const inSample = samples[i];
      buf[pos] = inSample + fb * interp;
      const result = (inSample + interp) * 0.5;
      pos = (pos + 1) & mask;
      samples[i] = result !== result ? 0 : result;
    }
    this.pos = pos;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'comb',
    name: 'Comb Filter',
    category: 'delay',
    description: 'Feedback comb filter with cubic Hermite interpolation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Frequency (Hz)', type: 'float', min: 10, max: 1000, step: 1, value: 100, tooltip: 'Fundamental comb delay pitch' },
      { name: 'feedback', label: 'Feedback', type: 'float', min: -0.99, max: 0.99, step: 0.01, value: 0.1, tooltip: 'Resonance feedback intensity' },
    ],
  },
  create: (sr) => new CombFilter(sr),
};
