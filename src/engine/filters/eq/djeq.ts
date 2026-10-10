import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { Biquad } from '../../biquad.ts';

// 1. DjEq: 3-band equalizer (LADSPA dj_eq_1901)
export class DjEqFilter extends BaseDspFilter {
  lo = -10.0;
  mid = 1.0;
  hi = -10.0;
  peakBw = 0.3;
  shelfSlope = 1.5;

  private f1 = new Biquad();
  private f2 = new Biquad();
  private f3 = new Biquad();

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.f1.reset();
    this.f2.reset();
    this.f3.reset();
    this.f1.eqSetParams(100.0, this.lo, this.peakBw, this.sampleRate);
    this.f2.eqSetParams(1000.0, this.mid, this.peakBw, this.sampleRate);
    this.f3.hsSetParams(10000.0, this.hi, this.shelfSlope, this.sampleRate);
  }

  randomize(): void {
    this.lo = -70 + Math.random() * 80;
    this.mid = -70 + Math.random() * 80;
    this.hi = -70 + Math.random() * 80;
    this.peakBw = Math.random();
    this.shelfSlope = Math.random() * 2.0;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.lo !== undefined) this.lo = p.lo;
    if (p.mid !== undefined) this.mid = p.mid;
    if (p.hi !== undefined) this.hi = p.hi;
    if (p.peakBw !== undefined) this.peakBw = p.peakBw;
    if (p.shelfSlope !== undefined) this.shelfSlope = p.shelfSlope;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      lo: this.lo,
      mid: this.mid,
      hi: this.hi,
      peakBw: this.peakBw,
      shelfSlope: this.shelfSlope,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    let x1_1 = this.f1.x1, x2_1 = this.f1.x2, y1_1 = this.f1.y1, y2_1 = this.f1.y2;
    const b0_1 = this.f1.b0, b1_1 = this.f1.b1, b2_1 = this.f1.b2, a1_1 = this.f1.a1, a2_1 = this.f1.a2;

    let x1_2 = this.f2.x1, x2_2 = this.f2.x2, y1_2 = this.f2.y1, y2_2 = this.f2.y2;
    const b0_2 = this.f2.b0, b1_2 = this.f2.b1, b2_2 = this.f2.b2, a1_2 = this.f2.a1, a2_2 = this.f2.a2;

    let x1_3 = this.f3.x1, x2_3 = this.f3.x2, y1_3 = this.f3.y1, y2_3 = this.f3.y2;
    const b0_3 = this.f3.b0, b1_3 = this.f3.b1, b2_3 = this.f3.b2, a1_3 = this.f3.a1, a2_3 = this.f3.a2;

    for (let i = 0; i < len; i++) {
      const s0 = samples[i];
      const s1 = b0_1 * s0 + b1_1 * x1_1 + b2_1 * x2_1 + a1_1 * y1_1 + a2_1 * y2_1;
      x2_1 = x1_1; x1_1 = s0; y2_1 = y1_1; y1_1 = s1;

      const s2 = b0_2 * s1 + b1_2 * x1_2 + b2_2 * x2_2 + a1_2 * y1_2 + a2_2 * y2_2;
      x2_2 = x1_2; x1_2 = s1; y2_2 = y1_2; y1_2 = s2;

      const s3 = b0_3 * s2 + b1_3 * x1_3 + b2_3 * x2_3 + a1_3 * y1_3 + a2_3 * y2_3;
      x2_3 = x1_3; x1_3 = s2; y2_3 = y1_3; y1_3 = s3;

      samples[i] = s3;
    }

    this.f1.x1 = x1_1; this.f1.x2 = x2_1; this.f1.y1 = y1_1; this.f1.y2 = y2_1;
    this.f2.x1 = x1_2; this.f2.x2 = x2_2; this.f2.y1 = y1_2; this.f2.y2 = y2_2;
    this.f3.x1 = x1_3; this.f3.x2 = x2_3; this.f3.y1 = y1_3; this.f3.y2 = y2_3;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'djeq',
    name: 'DJ 3-Band EQ',
    category: 'eq',
    description: '3-band equalizer with low shelf, mid peak, and high shelf.',
    defaultSampleRate: 44100,
    params: [
      { name: 'lo', label: 'Bass (dB)', type: 'float', min: -70, max: 20, step: 0.5, value: -10, tooltip: 'Low-frequency band gain' },
      { name: 'mid', label: 'Mid (dB)', type: 'float', min: -70, max: 20, step: 0.5, value: 1, tooltip: 'Midrange frequency band gain' },
      { name: 'hi', label: 'Treble (dB)', type: 'float', min: -70, max: 20, step: 0.5, value: -10, tooltip: 'High-frequency band gain' },
      { name: 'peakBw', label: 'Peak Bandwidth', type: 'float', min: 0.1, max: 2, step: 0.05, value: 0.3, tooltip: 'Q factor / sharpness of the mid bell peak' },
      { name: 'shelfSlope', label: 'Shelf Slope', type: 'float', min: 0.1, max: 3, step: 0.1, value: 1.5, tooltip: 'Slope steepness of low/high shelves' },
    ],
  },
  create: (sr) => new DjEqFilter(sr),
};
