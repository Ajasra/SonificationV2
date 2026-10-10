import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 7. TReverb: Reverb delay with preallocated ring buffer (eliminating old Processing ArrayList autoboxing!)
export class TReverbFilter extends BaseDspFilter {
  delayMs = 2000;
  decay = 0.5;

  private buffer = new Float32Array(524288); // Preallocated power-of-two 512k ring buffer
  private bufferMask = 524287;
  private delSample = 0;
  private head = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.delSample = Math.min(this.bufferMask, Math.floor((this.delayMs * this.sampleRate) / 1000));
    this.buffer.fill(0);
    this.head = 0;
  }

  randomize(): void {
    this.decay = 0.1 + Math.random() * 0.87;
    this.delayMs = 1 + Math.random() * 9000;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.delayMs !== undefined) this.delayMs = p.delayMs;
    if (p.decay !== undefined) this.decay = p.decay;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      delayMs: this.delayMs,
      decay: this.decay,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const buf = this.buffer;
    const mask = this.bufferMask;
    const del = this.delSample;
    const dec = this.decay;
    let head = this.head;

    for (let i = 0; i < len; i++) {
      const inVal = samples[i];
      const readIdx = (head - del + mask + 1) & mask;
      const prev = buf[readIdx];
      const out = inVal + prev * dec;
      buf[head] = inVal;
      head = (head + 1) & mask;
      samples[i] = out !== out ? 0 : out;
    }
    this.head = head;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'reverb',
    name: 'TReverb',
    category: 'delay',
    description: 'Long delay reverberation chamber.',
    defaultSampleRate: 44100,
    params: [
      { name: 'delayMs', label: 'Delay (ms)', type: 'float', min: 10, max: 8000, step: 10, value: 2000, tooltip: 'Acoustic chamber pre-delay time' },
      { name: 'decay', label: 'Decay', type: 'float', min: 0.05, max: 0.95, step: 0.01, value: 0.5, tooltip: 'Reverberation tail decay time' },
    ],
  },
  create: (sr) => new TReverbFilter(sr),
};
