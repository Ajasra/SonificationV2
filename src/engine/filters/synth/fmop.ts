import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp, TWO_PI } from '../util.ts';

// 1. FM Operator: the input phase-modulates a sine carrier (with self feedback).
export class FmOperatorFilter extends BaseDspFilter {
  freq = 220;
  index = 3.0;
  feedback = 0.0;
  mix = 0.8;

  private phase = 0;
  private prev = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.phase = 0;
    this.prev = 0;
  }

  randomize(): void {
    this.freq = 55 * Math.pow(2, Math.random() * 5);
    this.index = Math.random() * 8;
    this.feedback = Math.random() * 0.6;
    this.mix = 0.6 + Math.random() * 0.4;
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = clamp(p.freq, 20, 4000);
    if (p.index !== undefined) this.index = clamp(p.index, 0, 20);
    if (p.feedback !== undefined) this.feedback = clamp(p.feedback, 0, 1);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return { freq: this.freq, index: this.index, feedback: this.feedback, mix: this.mix };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const inc = (this.freq / this.sampleRate) * TWO_PI;
    const idx = this.index;
    const fb = this.feedback * 2;
    const mix = this.mix;
    const dry = 1 - mix;
    let ph = this.phase;
    let prev = this.prev;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      const out = Math.sin(ph + idx * x + fb * prev);
      prev = out;
      ph += inc;
      if (ph > TWO_PI) ph -= TWO_PI;
      samples[i] = x * dry + out * mix * 0.7;
    }

    this.phase = ph;
    this.prev = prev;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'fmop',
    name: 'FM Operator',
    category: 'synth',
    description: 'Input signal phase-modulates a sine carrier with optional self-feedback.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Carrier (Hz)', type: 'float', min: 20, max: 4000, step: 5, value: 220, tooltip: 'Carrier oscillator frequency' },
      { name: 'index', label: 'Index', type: 'float', min: 0, max: 20, step: 0.1, value: 3, tooltip: 'Modulation index (brightness)' },
      { name: 'feedback', label: 'Feedback', type: 'float', min: 0, max: 1, step: 0.05, value: 0, tooltip: 'Operator self-feedback for saw-like timbres' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.8, tooltip: 'Dry/wet balance' },
    ],
  },
  create: (sr) => new FmOperatorFilter(sr),
};
