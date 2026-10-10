import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 5. AuEcho: Audacity Echo effect
export class AuEchoFilter extends BaseDspFilter {
  delay = 0.5; // seconds
  decay = 0.5;

  private history = new Float32Array(96000); // Preallocated max buffer
  private histLen = 0;
  private histPos = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.histLen = Math.max(1, Math.min(96000, Math.floor(this.sampleRate * this.delay)));
    this.history.fill(0);
    this.histPos = 0;
  }

  randomize(): void {
    this.delay = 0.001 + Math.random() * 0.999;
    this.decay = Math.random();
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.delay !== undefined) this.delay = p.delay;
    if (p.decay !== undefined) this.decay = p.decay;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      delay: this.delay,
      decay: this.decay,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const hist = this.history;
    const hLen = this.histLen;
    let hPos = this.histPos;
    const dec = this.decay;

    for (let i = 0; i < len; i++) {
      if (hPos >= hLen) hPos = 0;
      const delayed = hist[hPos];
      const result = samples[i] + delayed * dec;
      hist[hPos] = result;
      hPos++;
      samples[i] = result !== result ? 0 : result;
    }
    this.histPos = hPos;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'echo',
    name: 'Echo Delay',
    category: 'delay',
    description: 'Audacity audio echo with decay feedback.',
    defaultSampleRate: 44100,
    params: [
      { name: 'delay', label: 'Delay Time (s)', type: 'float', min: 0.001, max: 1.0, step: 0.001, value: 0.5, tooltip: 'Time between echo repeats' },
      { name: 'decay', label: 'Decay Factor', type: 'float', min: 0.0, max: 0.99, step: 0.01, value: 0.5, tooltip: 'Volume decay multiplier per echo' },
    ],
  },
  create: (sr) => new AuEchoFilter(sr),
};
