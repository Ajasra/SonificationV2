import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 3. Dropout / Glitch: random short mutes like worn tape.
export class DropoutFilter extends BaseDspFilter {
  rate = 3;        // drops per second
  length = 60;     // ms
  smooth = 4;      // ms
  depth = 1.0;     // 0..1 how deep each dropout is

  private remaining = 0;
  private gain = 1;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.remaining = 0;
    this.gain = 1;
  }

  randomize(): void {
    this.rate = 0.5 + Math.random() * 8;
    this.length = 10 + Math.random() * 200;
    this.smooth = 1 + Math.random() * 15;
    this.depth = 0.6 + Math.random() * 0.4;
  }

  setParams(p: Record<string, number>): void {
    if (p.rate !== undefined) this.rate = clamp(p.rate, 0.1, 30);
    if (p.length !== undefined) this.length = clamp(p.length, 2, 800);
    if (p.smooth !== undefined) this.smooth = clamp(p.smooth, 0.2, 100);
    if (p.depth !== undefined) this.depth = clamp(p.depth, 0, 1);
  }

  getParams(): Record<string, number> {
    return { rate: this.rate, length: this.length, smooth: this.smooth, depth: this.depth };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const prob = this.rate / sr;
    const lenSamples = (this.length / 1000) * sr;
    const coeff = 1 - Math.exp(-1 / Math.max(1, (this.smooth / 1000) * sr));
    const lowGain = 1 - this.depth;
    let rem = this.remaining;
    let g = this.gain;

    for (let i = 0; i < len; i++) {
      if (rem <= 0 && Math.random() < prob) {
        rem = Math.floor(lenSamples * (0.5 + Math.random()));
      }
      const target = rem > 0 ? lowGain : 1;
      if (rem > 0) rem--;
      g += (target - g) * coeff;
      samples[i] *= g;
    }

    this.remaining = rem;
    this.gain = g;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'dropout',
    name: 'Dropout / Glitch',
    category: 'lofi',
    description: 'Random short signal dropouts like worn or damaged tape.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (/s)', type: 'float', min: 0.1, max: 30, step: 0.1, value: 3, tooltip: 'Average dropouts per second' },
      { name: 'length', label: 'Length (ms)', type: 'float', min: 2, max: 800, step: 1, value: 60, tooltip: 'Average dropout duration' },
      { name: 'smooth', label: 'Smooth (ms)', type: 'float', min: 0.2, max: 100, step: 0.2, value: 4, tooltip: 'Fade time in and out of the dropout' },
      { name: 'depth', label: 'Depth', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'How much level is lost (1 = full mute)' },
    ],
  },
  create: (sr) => new DropoutFilter(sr),
};
