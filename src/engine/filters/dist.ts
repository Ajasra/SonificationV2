// Distortion, Saturation, and Nonlinear Filters: Vynil, VacuumTubeAmp, TapSigmoid, Divider, TShiftR, Randmix, AuAmplify
import { BaseDspFilter } from './base.ts';
import { Biquad } from '../biquad.ts';
import { fastSigmoid } from '../fast-lut.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// 16. Vynil: Turntable vinyl record simulator (LADSPA vynil_1905)
export class VynilFilter extends BaseDspFilter {
  year = 1987;
  rpm = 63;
  warp = 0.45;
  click = 0.235;
  wear = 0;

  private bufferM = new Float32Array(16384);
  private bufferS = new Float32Array(16384);
  private bufferMask = 16383;
  private bufferPos = 0;

  private clickBuffer = new Float32Array(4096);
  private clickBufferPos = 0;
  private clickBufferOmega = 0;
  private clickGain = 0;

  private phi = 0.0;
  private def = 0.0;
  private defTarget = 0.0;
  private sampleCnt = 0;
  private randSeed = 23;

  private omega = 0;
  private age = 0;
  private clickProb = 0;
  private noiseAmp = 0;
  private stereo = 0;
  private wrapGain = 0;
  private wrapBias = 0;

  private lowpM = new Biquad();
  private lowpS = new Biquad();
  private highp = new Biquad();
  private noiseFilt = new Biquad();

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    for (let i = 0; i < 4096; i++) {
      if (i < 2048) {
        let v = i / 2048.0;
        v *= v;
        v *= v;
        v *= v;
        this.clickBuffer[i] = v;
      } else {
        this.clickBuffer[i] = this.clickBuffer[4096 - i];
      }
    }
    this.init();
  }

  private fnoise(): number {
    this.randSeed = (this.randSeed * 196314165 + 907633515) | 0;
    return this.randSeed / 2147483647.0;
  }

  init(): void {
    this.sampleCnt = 0;
    this.def = 0.0;
    this.defTarget = 0.0;
    this.bufferPos = 0;
    this.clickBufferPos = 0;
    this.clickBufferOmega = 0;
    this.clickGain = 0;
    this.phi = 0.0;
    this.bufferM.fill(0);
    this.bufferS.fill(0);

    const fs = this.sampleRate;
    this.omega = 960.0 / (this.rpm * fs);
    this.age = (2000 - this.year) * 0.01;
    this.clickProb = Math.abs(this.age * this.age * 0.1 + this.click * 0.02);
    this.noiseAmp = (this.click + this.wear * 0.3) * 0.12 + (1993.0 - this.year) * 0.0031;
    const bandwidth = (this.year - 1880.0) * (this.rpm * 1.9);
    const noiseBandwidth = bandwidth * (0.25 - this.wear * 0.02) + this.click * 200.0 + 300.0;
    this.stereo = clamp((this.year - 1940.0) * 0.02, 0.0, 1.0);
    this.wrapGain = this.age * 3.1 + 0.05;
    this.wrapBias = this.age * 0.1;

    this.lowpM.reset();
    this.lowpS.reset();
    this.highp.reset();
    this.noiseFilt.reset();

    this.lowpM.lpSetParams(bandwidth * (1.0 - this.wear * 0.86), 2.0, fs);
    this.lowpS.lpSetParams(bandwidth * (1.0 - this.wear * 0.89), 2.0, fs);
    this.highp.hpSetParams((2000.0 - this.year) * 8.0, 1.5, fs);
    this.noiseFilt.lpSetParams(noiseBandwidth, 4.0 + this.wear * 2.0, fs);
  }

  randomize(): void {
    this.year = 1900 + Math.random() * 90;
    this.rpm = 33 + Math.random() * 45;
    this.warp = Math.random() * 0.4;
    this.click = Math.random();
    this.wear = Math.random();
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.year !== undefined) this.year = p.year;
    if (p.rpm !== undefined) this.rpm = p.rpm;
    if (p.warp !== undefined) this.warp = p.warp;
    if (p.click !== undefined) this.click = p.click;
    if (p.wear !== undefined) this.wear = p.wear;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      year: this.year,
      rpm: this.rpm,
      warp: this.warp,
      click: this.click,
      wear: this.wear,
    };
  }

  private df(x: number): number {
    return (Math.sin(x) + 1.0) * 0.5;
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const mask = this.bufferMask;

    for (let i = 0; i < len; i += 2) {
      if ((this.sampleCnt & 15) === 0) {
        const ang = this.phi * 2.0 * Math.PI;
        const w = this.warp * (2000 - this.year) * 0.01;
        this.defTarget =
          w * this.df(ang) * 0.5 +
          w * w * this.df(2.0 * ang) * 0.31 +
          w * w * w * this.df(3.0 * ang) * 0.129;
        this.phi += this.omega;
        while (this.phi > 1.0) this.phi -= 1.0;

        if (Math.random() < this.clickProb) {
          this.clickBufferOmega = Math.floor((Math.random() * 32000 + 1000) * this.rpm);
          this.clickGain = this.noiseAmp * 5.0 * this.fnoise();
        }
      }

      const deflec = this.def * 0.1 + this.defTarget * 0.9;
      const inL = samples[i];
      const inR = i + 1 < len ? samples[i + 1] : inL;

      this.bufferM[this.bufferPos] = inL + inR;
      this.bufferS[this.bufferPos] = inL - inR;

      const ofs = this.sampleRate * 0.009 * deflec;
      const o1 = Math.floor(ofs);
      const o2 = Math.ceil(ofs);
      const frac = ofs - o1;

      const idx1 = (this.bufferPos - o1 - 1) & mask;
      const idx2 = (this.bufferPos - o2 - 1) & mask;

      let srcM = lerp(this.bufferM[idx1], this.bufferM[idx2], frac);
      let srcS = lerp(this.bufferS[idx1], this.bufferS[idx2], frac);

      const clickVal = this.clickBuffer[this.clickBufferPos & 4095] * this.clickGain;
      srcM = this.lowpM.run(srcM + clickVal);
      srcM = lerp(srcM, Math.sin(srcM * this.wrapGain + this.wrapBias), this.age);
      srcM =
        this.highp.run(srcM) +
        this.noiseFilt.run(this.fnoise()) * this.noiseAmp +
        clickVal * 0.5;
      srcS = this.lowpS.run(srcS) * this.stereo;

      samples[i] = 0.5 * (srcS + srcM);
      if (i + 1 < len) {
        samples[i + 1] = 0.5 * (srcM - srcS);
      }

      this.bufferPos = (this.bufferPos + 1) & mask;
      this.clickBufferPos += this.clickBufferOmega;
      if (this.clickBufferPos >= 4096) {
        this.clickBufferPos = 0;
        this.clickBufferOmega = 0;
      }
      this.sampleCnt++;
      this.def = deflec;
    }
  }
}

// 17. VacuumTubeAmp: Nonlinear digital vacuum tube transfer curve
export class VacuumTubeAmpFilter extends BaseDspFilter {
  rangeA = -0.5;
  rangeB = 0.5;

  private k1 = 0;
  private k2 = 0;
  private k3 = 0;
  private k4 = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.k1 = this.rangeA * this.rangeA;
    this.k2 = 1 + this.rangeA + this.rangeA;
    this.k3 = this.rangeB * this.rangeB;
    this.k4 = 1 - (this.rangeB + this.rangeB);
  }

  randomize(): void {
    this.rangeA = -1 + Math.random() * 1.9;
    this.rangeB = this.rangeA + 0.0001 + Math.random() * (1 - (this.rangeA + 0.0001));
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.rangeA !== undefined) this.rangeA = p.rangeA;
    if (p.rangeB !== undefined) this.rangeB = p.rangeB;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      rangeA: this.rangeA,
      rangeB: this.rangeB,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const rA = this.rangeA;
    const rB = this.rangeB;
    const k1 = this.k1;
    const k2 = this.k2;
    const k3 = this.k3;
    const k4 = this.k4;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      let out = x;
      if (x < rA) {
        out = (k1 + x) / Math.max(1e-6, k2 - x);
      } else if (x > rB) {
        out = (x - k3) / Math.max(1e-6, x + k4);
      }
      samples[i] = out !== out ? 0 : out;
    }
  }
}

// 18. TapSigmoid: Sigmoid soft saturation curve
export class TapSigmoidFilter extends BaseDspFilter {
  fact = -5.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
  }

  init(): void {}

  randomize(): void {
    this.fact = -10 + Math.random() * 9;
  }

  setParams(p: Record<string, number>): void {
    if (p.fact !== undefined) this.fact = p.fact;
  }

  getParams(): Record<string, number> {
    return { fact: this.fact };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    for (let i = 0; i < len; i++) {
      samples[i] = fastSigmoid(samples[i]);
    }
  }
}

// 19. Divider: Subharmonic zero-crossing frequency divider
export class DividerFilter extends BaseDspFilter {
  denominator = 2;

  private out = 1.0;
  private amp = 0.0;
  private count = 0.0;
  private lamp = 0.0;
  private last = 0.0;
  private zeroxs = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.out = 1.0;
    this.amp = 0.0;
    this.count = 0.0;
    this.lamp = 0.0;
    this.last = 0.0;
    this.zeroxs = 0;
  }

  randomize(): void {
    this.denominator = Math.random() < 0.8 ? Math.floor(1 + Math.random() * 11) : Math.floor(1 + Math.random() * 99);
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.denominator !== undefined) this.denominator = Math.max(1, Math.floor(p.denominator));
    this.init();
  }

  getParams(): Record<string, number> {
    return { denominator: this.denominator };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const denom = this.denominator;

    for (let i = 0; i < len; i++) {
      this.count += 1.0;
      const s = samples[i];
      if ((s > 0.0 && this.last <= 0.0) || (s < 0.0 && this.last >= 0.0)) {
        this.zeroxs++;
        if (denom === 1) {
          this.out = this.out > 0.0 ? -1.0 : 1.0;
          this.lamp = this.amp / Math.max(1, this.count);
          this.zeroxs = 0;
          this.count = 0.0;
          this.amp = 0.0;
        }
      }
      this.amp += Math.abs(s);
      if (denom > 1 && this.zeroxs % denom === denom - 1) {
        this.out = this.out > 0.0 ? -1.0 : 1.0;
        this.lamp = this.amp / Math.max(1, this.count);
        this.zeroxs = 0;
        this.count = 0.0;
        this.amp = 0.0;
      }
      this.last = s;
      const res = this.out * this.lamp;
      samples[i] = res !== res ? 0 : res;
    }
  }
}

// 20. TShiftR: Square root feedback fold distortion
export class TShiftRFilter extends BaseDspFilter {
  mPasses = 5;
  mDiv = 1.0;
  private prev = 0.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.prev = 0.0;
  }

  randomize(): void {
    this.mPasses = Math.floor(1 + Math.random() * 10);
    this.mDiv = 0.5 + Math.random() * 4.5;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.mPasses !== undefined) this.mPasses = Math.max(1, Math.floor(p.mPasses));
    if (p.mDiv !== undefined) this.mDiv = p.mDiv;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      mPasses: this.mPasses,
      mDiv: this.mDiv,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const passes = this.mPasses;
    const div = this.mDiv;

    for (let i = 0; i < len; i++) {
      const inVal = samples[i];
      let out = inVal;
      for (let p = 0; p < passes; p++) {
        const arg = (out + this.prev) / (inVal * div);
        out = arg < 1e-10 ? 0.0 : Math.sqrt(Math.abs(arg));
      }
      this.prev = inVal;
      samples[i] = out !== out ? 0 : out;
    }
  }
}

// 21. Randmix: Random impulse response history filter
export class RandmixFilter extends BaseDspFilter {
  tail = 10;
  private prev = new Float32Array(64);
  private w = new Float32Array(64);
  private idx = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.idx = 0;
    this.prev.fill(0);
    let sum = 0;
    for (let i = 0; i < this.tail; i++) {
      this.w[i] = Math.sqrt(Math.random());
      sum += this.w[i];
    }
    const invSum = sum > 0 ? 1.0 / sum : 1.0;
    for (let i = 0; i < this.tail; i++) {
      this.w[i] *= invSum;
    }
  }

  randomize(): void {
    this.tail = Math.floor(5 + Math.random() * 25);
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.tail !== undefined) this.tail = Math.min(64, Math.max(2, Math.floor(p.tail)));
    this.init();
  }

  getParams(): Record<string, number> {
    return { tail: this.tail };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const tail = this.tail;
    const prev = this.prev;
    const w = this.w;
    let idx = this.idx;

    for (let i = 0; i < len; i++) {
      prev[idx] = samples[i];
      let s = 0;
      let pIdx = idx;
      for (let j = 0; j < tail; j++) {
        s += prev[pIdx] * w[j];
        if (--pIdx < 0) pIdx = tail - 1;
      }
      prev[idx] = s;
      if (++idx >= tail) idx = 0;
      samples[i] = s !== s ? 0 : s;
    }
    this.idx = idx;
  }
}

// 22. AuAmplify: Gain amplifier
export class AuAmplifyFilter extends BaseDspFilter {
  amp = 1.0; // multiplier

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
  }

  init(): void {}

  randomize(): void {
    this.amp = 0.1 + Math.random() * 5.0;
  }

  setParams(p: Record<string, number>): void {
    if (p.amp !== undefined) this.amp = p.amp;
  }

  getParams(): Record<string, number> {
    return { amp: this.amp };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const a = this.amp;
    for (let i = 0; i < len; i++) {
      samples[i] *= a;
    }
  }
}
