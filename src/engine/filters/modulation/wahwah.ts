import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 9. AuWahwah: Audacity Wahwah filter
export class AuWahwahFilter extends BaseDspFilter {
  freq = 15;
  phaseDeg = 0;
  depth = 70;
  resonance = 25;
  freqOfs = 30;

  private lfoskip = 0;
  private xn1 = 0;
  private xn2 = 0;
  private yn1 = 0;
  private yn2 = 0;
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private skipcount = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.lfoskip = (this.freq * 2 * Math.PI) / this.sampleRate;
    this.skipcount = 0;
    this.xn1 = this.xn2 = this.yn1 = this.yn2 = 0;
    this.b0 = this.b1 = this.b2 = this.a1 = this.a2 = 0;
  }

  randomize(): void {
    this.freq = 0.1 + Math.random() * 40.0;
    this.phaseDeg = Math.random() * 360;
    this.depth = 10 + Math.random() * 90;
    this.resonance = 0.1 + Math.random() * 100.0;
    this.freqOfs = Math.random() * 100;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = p.freq;
    if (p.phaseDeg !== undefined) this.phaseDeg = p.phaseDeg;
    if (p.depth !== undefined) this.depth = p.depth;
    if (p.resonance !== undefined) this.resonance = p.resonance;
    if (p.freqOfs !== undefined) this.freqOfs = p.freqOfs;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      freq: this.freq,
      phaseDeg: this.phaseDeg,
      depth: this.depth,
      resonance: this.resonance,
      freqOfs: this.freqOfs,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const dNorm = this.depth / 100.0;
    const fOfsNorm = this.freqOfs / 100.0;
    const pRad = (this.phaseDeg * Math.PI) / 180.0;
    const res = this.resonance;
    let sc = this.skipcount;
    let periodCount = sc % 30;

    let b0 = this.b0, b1 = this.b1, b2 = this.b2, a1 = this.a1, a2 = this.a2;
    let xn1 = this.xn1, xn2 = this.xn2, yn1 = this.yn1, yn2 = this.yn2;

    for (let i = 0; i < len; i++) {
      const inVal = samples[i];
      if (periodCount === 0) {
        let f = (1 + Math.cos(sc * this.lfoskip + pRad)) * 0.5;
        f = f * dNorm * (1 - fOfsNorm) + fOfsNorm;
        f = Math.exp((f - 1) * 6);
        const omega = Math.PI * f;
        const sn = Math.sin(omega);
        const cs = Math.cos(omega);
        const alpha = sn / (2 * res);
        const invA0 = 1.0 / (1 + alpha);
        b0 = ((1 - cs) * 0.5) * invA0;
        b1 = (1 - cs) * invA0;
        b2 = ((1 - cs) * 0.5) * invA0;
        a1 = (-2 * cs) * invA0;
        a2 = (1 - alpha) * invA0;
      }
      sc++;
      if (++periodCount === 30) periodCount = 0;

      const out = b0 * inVal + b1 * xn1 + b2 * xn2 - a1 * yn1 - a2 * yn2;
      xn2 = xn1;
      xn1 = inVal;
      yn2 = yn1;
      yn1 = out;
      samples[i] = out !== out ? 0 : out;
    }

    this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2;
    this.xn1 = xn1; this.xn2 = xn2; this.yn1 = yn1; this.yn2 = yn2;
    this.skipcount = sc;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'wahwah',
    name: 'Wahwah',
    category: 'modulation',
    description: 'Swept resonance bandpass filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'LFO Freq (Hz)', type: 'float', min: 0.1, max: 30, step: 0.1, value: 15, tooltip: 'Wah sweep modulation frequency' },
      { name: 'depth', label: 'Depth (%)', type: 'float', min: 0, max: 100, step: 1, value: 70, tooltip: 'Sweep modulation depth' },
      { name: 'resonance', label: 'Resonance', type: 'float', min: 0.5, max: 50, step: 0.5, value: 25, tooltip: 'Peak resonant filter sharpness (Q)' },
      { name: 'freqOfs', label: 'Freq Offset', type: 'float', min: 0, max: 100, step: 1, value: 30, tooltip: 'Center frequency start position' },
    ],
  },
  create: (sr) => new AuWahwahFilter(sr),
};
