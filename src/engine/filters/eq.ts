// EQ and frequency-domain filters: DjEq, AuBassTreble, ResonFilter
import { BaseDspFilter } from './base.ts';
import { Biquad } from '../biquad.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

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

// 3. ResonFilter: 2-pole resonating bandpass filter
export class ResonFilter extends BaseDspFilter {
  freqControl = 500.0;
  bwControl = 1000.0;

  private hist0 = 0;
  private hist1 = 0;
  private poleRadius = 0;
  private poleAngle = 0;
  private gainFactor = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.hist0 = 0;
    this.hist1 = 0;
    this.poleRadius = 1 - Math.PI * this.bwControl * this.invSampleRate;
    const cosArg =
      ((this.poleRadius + this.poleRadius) / (1 + this.poleRadius * this.poleRadius)) *
      Math.cos(2 * Math.PI * this.freqControl * this.invSampleRate);
    this.poleAngle = Math.acos(clamp(cosArg, -1, 1));
    this.gainFactor = (1 - this.poleRadius * this.poleRadius) * Math.sin(this.poleAngle);
  }

  randomize(): void {
    this.freqControl = 20 + Math.random() * 19980;
    this.bwControl = 100 + Math.random() * 900;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.freqControl !== undefined) this.freqControl = p.freqControl;
    if (p.bwControl !== undefined) this.bwControl = p.bwControl;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      freqControl: this.freqControl,
      bwControl: this.bwControl,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const pr2cos = 2 * this.poleRadius * Math.cos(this.poleAngle);
    const prSq = this.poleRadius * this.poleRadius;
    const gf = this.gainFactor;

    for (let i = 0; i < len; i++) {
      const res = gf * samples[i] + pr2cos * this.hist0 - prSq * this.hist1;
      this.hist1 = this.hist0;
      this.hist0 = res;
      samples[i] = res !== res ? 0 : res;
    }
  }
}
