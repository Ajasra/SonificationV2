import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 1. Envelope Filter (auto-wah): input level sweeps a state-variable filter cutoff.
export class EnvelopeFilter extends BaseDspFilter {
  sensitivity = 4.0;
  minFreq = 200;
  maxFreq = 4000;
  q = 4.0;
  mode = 1;        // 0=Lowpass 1=Bandpass

  private env = 0;
  private low = 0;
  private band = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.env = 0;
    this.low = 0;
    this.band = 0;
  }

  randomize(): void {
    this.sensitivity = 1 + Math.random() * 8;
    this.minFreq = 100 + Math.random() * 400;
    this.maxFreq = 1500 + Math.random() * 5000;
    this.q = 1 + Math.random() * 8;
    this.mode = Math.round(Math.random());
  }

  setParams(p: Record<string, number>): void {
    if (p.sensitivity !== undefined) this.sensitivity = clamp(p.sensitivity, 0.5, 20);
    if (p.minFreq !== undefined) this.minFreq = clamp(p.minFreq, 40, 2000);
    if (p.maxFreq !== undefined) this.maxFreq = clamp(p.maxFreq, 500, 12000);
    if (p.q !== undefined) this.q = clamp(p.q, 0.7, 15);
    if (p.mode !== undefined) this.mode = clamp(Math.round(p.mode), 0, 1);
  }

  getParams(): Record<string, number> {
    return { sensitivity: this.sensitivity, minFreq: this.minFreq, maxFreq: this.maxFreq, q: this.q, mode: this.mode };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const att = Math.exp(-1 / (0.005 * sr));
    const rel = Math.exp(-1 / (0.1 * sr));
    const lo = Math.min(this.minFreq, this.maxFreq - 1);
    const ratio = this.maxFreq / lo;
    const damp = 1 / this.q;
    const bp = this.mode === 1;
    let env = this.env;
    let low = this.low;
    let band = this.band;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      const a = Math.abs(x);
      env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;

      const t = Math.min(1, env * this.sensitivity);
      const fc = lo * Math.pow(ratio, t);
      const f = Math.min(1.2, 2 * Math.sin((Math.PI * fc) / sr));

      low += f * band;
      const high = x - low - damp * band;
      band += f * high;

      const out = bp ? band : low;
      samples[i] = out !== out || Math.abs(out) > 8 ? 0 : out;
    }

    this.env = env;
    this.low = low;
    this.band = band;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'envfilter',
    name: 'Envelope Filter',
    category: 'dynamics',
    description: 'Auto-wah: input level sweeps a resonant filter cutoff.',
    defaultSampleRate: 44100,
    params: [
      { name: 'sensitivity', label: 'Sensitivity', type: 'float', min: 0.5, max: 20, step: 0.5, value: 4, tooltip: 'How strongly input level opens the filter' },
      { name: 'minFreq', label: 'Min Freq (Hz)', type: 'float', min: 40, max: 2000, step: 10, value: 200, tooltip: 'Cutoff at silence' },
      { name: 'maxFreq', label: 'Max Freq (Hz)', type: 'float', min: 500, max: 12000, step: 50, value: 4000, tooltip: 'Cutoff at full level' },
      { name: 'q', label: 'Q', type: 'float', min: 0.7, max: 15, step: 0.1, value: 4, tooltip: 'Resonance' },
      { name: 'mode', label: 'Mode', type: 'int', min: 0, max: 1, step: 1, value: 1, tooltip: '0=Lowpass, 1=Bandpass' },
    ],
  },
  create: (sr) => new EnvelopeFilter(sr),
};
