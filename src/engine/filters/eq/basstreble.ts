import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 2. AuBassTreble: Audacity shelving bass and treble tone controls
export class AuBassTrebleFilter extends BaseDspFilter {
  dBBass = 0;
  dBTreble = 0;
  slopeB = 0.4;
  slopeT = 0.4;
  hzBass = 250.0;
  hzTreble = 4000.0;

  private xn1Bass = 0;
  private xn2Bass = 0;
  private yn1Bass = 0;
  private yn2Bass = 0;
  private b0Bass = 0;
  private b1Bass = 0;
  private b2Bass = 0;
  private invA0Bass = 1;
  private a1Bass = 0;
  private a2Bass = 0;

  private xn1Treble = 0;
  private xn2Treble = 0;
  private yn1Treble = 0;
  private yn2Treble = 0;
  private b0Treble = 0;
  private b1Treble = 0;
  private b2Treble = 0;
  private invA0Treble = 1;
  private a1Treble = 0;
  private a2Treble = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.xn1Bass = this.xn2Bass = this.yn1Bass = this.yn2Bass = 0;
    this.xn1Treble = this.xn2Treble = this.yn1Treble = this.yn2Treble = 0;

    const fs = this.sampleRate;
    const wB = (2 * Math.PI * this.hzBass) / fs;
    const aB = Math.exp((Math.log(10.0) * this.dBBass) / 40);
    const bB = Math.sqrt((aB * aB + 1) / this.slopeB - Math.pow(aB - 1, 2));

    this.b0Bass = aB * (aB + 1 - (aB - 1) * Math.cos(wB) + bB * Math.sin(wB));
    this.b1Bass = 2 * aB * (aB - 1 - (aB + 1) * Math.cos(wB));
    this.b2Bass = aB * (aB + 1 - (aB - 1) * Math.cos(wB) - bB * Math.sin(wB));
    const a0B = aB + 1 + (aB - 1) * Math.cos(wB) + bB * Math.sin(wB);
    this.invA0Bass = 1.0 / Math.max(1e-6, a0B);
    this.a1Bass = -2 * (aB - 1 + (aB + 1) * Math.cos(wB));
    this.a2Bass = aB + 1 + (aB - 1) * Math.cos(wB) - bB * Math.sin(wB);

    const wT = (2 * Math.PI * this.hzTreble) / fs;
    const aT = Math.exp((Math.log(10.0) * this.dBTreble) / 40);
    const bT = Math.sqrt((aT * aT + 1) / this.slopeT - Math.pow(aT - 1, 2));

    this.b0Treble = aT * (aT + 1 + (aT - 1) * Math.cos(wT) + bT * Math.sin(wT));
    this.b1Treble = -2 * aT * (aT - 1 + (aT + 1) * Math.cos(wT));
    this.b2Treble = aT * (aT + 1 + (aT - 1) * Math.cos(wT) - bT * Math.sin(wT));
    const a0T = aT + 1 - (aT - 1) * Math.cos(wT) + bT * Math.sin(wT);
    this.invA0Treble = 1.0 / Math.max(1e-6, a0T);
    this.a1Treble = 2 * (aT - 1 - (aT + 1) * Math.cos(wT));
    this.a2Treble = aT + 1 - (aT - 1) * Math.cos(wT) - bT * Math.sin(wT);
  }

  randomize(): void {
    this.dBBass = -30 + Math.random() * 60;
    this.dBTreble = -30 + Math.random() * 60;
    this.slopeB = 0.1 + Math.random() * 0.7;
    this.slopeT = 0.1 + Math.random() * 0.7;
    this.hzBass = 100 + Math.random() * 400;
    this.hzTreble = 3000 + Math.random() * 5000;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.dBBass !== undefined) this.dBBass = p.dBBass;
    if (p.dBTreble !== undefined) this.dBTreble = p.dBTreble;
    if (p.slopeB !== undefined) this.slopeB = p.slopeB;
    if (p.slopeT !== undefined) this.slopeT = p.slopeT;
    if (p.hzBass !== undefined) this.hzBass = p.hzBass;
    if (p.hzTreble !== undefined) this.hzTreble = p.hzTreble;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      dBBass: this.dBBass,
      dBTreble: this.dBTreble,
      slopeB: this.slopeB,
      slopeT: this.slopeT,
      hzBass: this.hzBass,
      hzTreble: this.hzTreble,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    let xn1B = this.xn1Bass, xn2B = this.xn2Bass, yn1B = this.yn1Bass, yn2B = this.yn2Bass;
    const b0B = this.b0Bass, b1B = this.b1Bass, b2B = this.b2Bass, a1B = this.a1Bass, a2B = this.a2Bass, invA0B = this.invA0Bass;

    let xn1T = this.xn1Treble, xn2T = this.xn2Treble, yn1T = this.yn1Treble, yn2T = this.yn2Treble;
    const b0T = this.b0Treble, b1T = this.b1Treble, b2T = this.b2Treble, a1T = this.a1Treble, a2T = this.a2Treble, invA0T = this.invA0Treble;

    for (let i = 0; i < len; i++) {
      const inVal = samples[i];
      const outB = (b0B * inVal + b1B * xn1B + b2B * xn2B - a1B * yn1B - a2B * yn2B) * invA0B;
      xn2B = xn1B; xn1B = inVal; yn2B = yn1B; yn1B = outB;

      const outT = (b0T * outB + b1T * xn1T + b2T * xn2T - a1T * yn1T - a2T * yn2T) * invA0T;
      xn2T = xn1T; xn1T = outB; yn2T = yn1T; yn1T = outT;

      samples[i] = outT;
    }

    this.xn1Bass = xn1B; this.xn2Bass = xn2B; this.yn1Bass = yn1B; this.yn2Bass = yn2B;
    this.xn1Treble = xn1T; this.xn2Treble = xn2T; this.yn1Treble = yn1T; this.yn2Treble = yn2T;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'basstreble',
    name: 'Bass & Treble',
    category: 'eq',
    description: 'Audacity shelving tone control.',
    defaultSampleRate: 44100,
    params: [
      { name: 'dBBass', label: 'Bass (dB)', type: 'float', min: -30, max: 30, step: 0.5, value: 0, tooltip: 'Low shelf boost/cut' },
      { name: 'dBTreble', label: 'Treble (dB)', type: 'float', min: -30, max: 30, step: 0.5, value: 0, tooltip: 'High shelf boost/cut' },
      { name: 'hzBass', label: 'Bass Cutoff (Hz)', type: 'float', min: 50, max: 500, step: 10, value: 250, tooltip: 'Low shelf transition frequency' },
      { name: 'hzTreble', label: 'Treble Cutoff (Hz)', type: 'float', min: 1000, max: 8000, step: 50, value: 4000, tooltip: 'High shelf transition frequency' },
    ],
  },
  create: (sr) => new AuBassTrebleFilter(sr),
};
