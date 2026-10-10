import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 2. Sample Rate Reducer: zero-order hold at an arbitrary rate (Hz) with clock jitter.
export class SampleRateReducerFilter extends BaseDspFilter {
  rate = 8000;     // target Hz
  jitter = 0.0;    // 0..1 clock jitter
  mix = 1.0;

  private acc = 0;
  private held = 0;
  private threshold = 1;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.acc = 0;
    this.held = 0;
    this.threshold = 1;
  }

  randomize(): void {
    this.rate = 1000 + Math.random() * 11000;
    this.jitter = Math.random() * 0.5;
    this.mix = 1.0;
  }

  setParams(p: Record<string, number>): void {
    if (p.rate !== undefined) this.rate = clamp(p.rate, 200, 48000);
    if (p.jitter !== undefined) this.jitter = clamp(p.jitter, 0, 1);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return { rate: this.rate, jitter: this.jitter, mix: this.mix };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const inc = Math.min(1, this.rate / this.sampleRate);
    const mix = this.mix;
    const dry = 1 - mix;
    const jit = this.jitter;
    let acc = this.acc;
    let held = this.held;
    let thr = this.threshold;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      acc += inc;
      if (acc >= thr) {
        acc -= thr;
        held = x;
        thr = 1 + jit * (Math.random() - 0.5) * 1.6;
      }
      samples[i] = x * dry + held * mix;
    }

    this.acc = acc;
    this.held = held;
    this.threshold = thr;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'srreducer',
    name: 'Sample Rate Reducer',
    category: 'lofi',
    description: 'Zero-order-hold resampler to any rate in Hz, with clock jitter for gritty aliasing.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (Hz)', type: 'float', min: 200, max: 48000, step: 100, value: 8000, tooltip: 'Target sample rate' },
      { name: 'jitter', label: 'Jitter', type: 'float', min: 0, max: 1, step: 0.05, value: 0, tooltip: 'Random clock timing instability' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'Dry/wet balance' },
    ],
  },
  create: (sr) => new SampleRateReducerFilter(sr),
};
