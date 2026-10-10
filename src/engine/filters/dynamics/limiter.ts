import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 3. Look-ahead Limiter: delayed signal is attenuated ahead of peaks, then hard-capped at the ceiling.
export class LimiterFilter extends BaseDspFilter {
  ceiling = -1.0;  // dB
  release = 120;   // ms
  drive = 0;       // dB of input makeup gain

  private buf = new Float32Array(0);
  private pos = 0;
  private look = 0;
  private gain = 1;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.look = Math.max(1, Math.floor(this.sampleRate * 0.005));
    this.buf = new Float32Array(this.look + 1);
    this.pos = 0;
    this.gain = 1;
  }

  randomize(): void {
    this.ceiling = -6 + Math.random() * 5;
    this.release = 40 + Math.random() * 300;
    this.drive = Math.random() * 12;
  }

  setParams(p: Record<string, number>): void {
    if (p.ceiling !== undefined) this.ceiling = clamp(p.ceiling, -24, 0);
    if (p.release !== undefined) this.release = clamp(p.release, 5, 1000);
    if (p.drive !== undefined) this.drive = clamp(p.drive, 0, 24);
  }

  getParams(): Record<string, number> {
    return { ceiling: this.ceiling, release: this.release, drive: this.drive };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const buf = this.buf;
    const size = buf.length;
    const ceil = Math.pow(10, this.ceiling / 20);
    const makeup = Math.pow(10, this.drive / 20);
    const att = 1 - Math.exp(-1 / Math.max(1, this.look / 3));
    const rel = 1 - Math.exp(-1 / Math.max(1, (this.release / 1000) * this.sampleRate));
    let pos = this.pos;
    let g = this.gain;

    for (let i = 0; i < len; i++) {
      const x = samples[i] * makeup;
      const a = Math.abs(x);
      const target = a > ceil ? ceil / a : 1;
      g += (target - g) * (target < g ? att : rel);

      // read oldest sample (look-ahead delay) then store new
      const delayed = buf[pos];
      buf[pos] = x;
      if (++pos >= size) pos = 0;

      const out = delayed * g;
      samples[i] = out > ceil ? ceil : out < -ceil ? -ceil : out;
    }

    this.pos = pos;
    this.gain = g;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'limiter',
    name: 'Look-ahead Limiter',
    category: 'dynamics',
    description: 'Brickwall limiter with 5 ms look-ahead to keep peaks under the ceiling.',
    defaultSampleRate: 44100,
    params: [
      { name: 'ceiling', label: 'Ceiling (dB)', type: 'float', min: -24, max: 0, step: 0.5, value: -1, tooltip: 'Maximum output level' },
      { name: 'release', label: 'Release (ms)', type: 'float', min: 5, max: 1000, step: 5, value: 120, tooltip: 'Gain recovery time' },
      { name: 'drive', label: 'Drive (dB)', type: 'float', min: 0, max: 24, step: 0.5, value: 0, tooltip: 'Input gain pushed into the limiter' },
    ],
  },
  create: (sr) => new LimiterFilter(sr),
};
