// Phasers and Modulation Filters: AuPhaser, AuWahwah, LFOPhaser, FourByFourPole, AutoPhaser, TapAutopan
import { BaseDspFilter } from './base.ts';

export class PhasersAllPass {
  a1 = 0.0;
  zm1 = 0.0;

  run(x: number): number {
    const y = x * -this.a1 + this.zm1;
    this.zm1 = y * this.a1 + x;
    return y;
  }

  setDelay(d: number): void {
    this.a1 = (1.0 - d) / (1.0 + d);
  }

  clear(): void {
    this.a1 = 0.0;
    this.zm1 = 0.0;
  }
}

export class PhasersEnvelope {
  ga = 1.0;
  gr = 1.0;
  env = 0.0;

  run(inVal: number): number {
    let envLvl = this.env;
    const absIn = Math.abs(inVal);
    if (envLvl < absIn) {
      envLvl = this.ga * (envLvl - absIn) + absIn;
    } else {
      envLvl = this.gr * (envLvl - absIn) + absIn;
    }
    this.env = envLvl;
    return envLvl;
  }

  setAttack(a: number): void {
    this.ga = Math.exp(-1.0 / Math.max(1e-6, a));
  }

  setRelease(r: number): void {
    this.gr = Math.exp(-1.0 / Math.max(1e-6, r));
  }
}

// 8. AuPhaser: Audacity multi-stage all-pass phaser
export class AuPhaserFilter extends BaseDspFilter {
  freq = 0.4;
  phaseDeg = 0;
  stages = 2;
  dryWet = 128;
  depth = 100;
  feedback = 0;

  private gain = 0;
  private fbout = 0;
  private lfoskip = 0;
  private phaseRad = 0;
  private old = new Float32Array(24);
  private skipcount = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.gain = 0;
    this.fbout = 0;
    this.lfoskip = (this.freq * 2 * Math.PI) / this.sampleRate;
    this.phaseRad = (this.phaseDeg * Math.PI) / 180;
    this.old.fill(0);
    this.skipcount = 0;
  }

  randomize(): void {
    this.stages = Math.floor(2 + Math.random() * 23);
    this.dryWet = Math.floor(Math.random() * 256);
    this.freq = 0.01 + Math.random() * 40.0;
    this.phaseDeg = Math.random() * 360;
    this.depth = Math.floor(1 + Math.random() * 255);
    this.feedback = -100 + Math.random() * 200;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = p.freq;
    if (p.phaseDeg !== undefined) this.phaseDeg = p.phaseDeg;
    if (p.stages !== undefined) this.stages = Math.floor(p.stages);
    if (p.dryWet !== undefined) this.dryWet = p.dryWet;
    if (p.depth !== undefined) this.depth = p.depth;
    if (p.feedback !== undefined) this.feedback = p.feedback;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      freq: this.freq,
      phaseDeg: this.phaseDeg,
      stages: this.stages,
      dryWet: this.dryWet,
      depth: this.depth,
      feedback: this.feedback,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const numStages = Math.min(24, Math.max(1, this.stages));
    const dry = (255.0 - this.dryWet) / 255.0;
    const wet = this.dryWet / 255.0;
    const fbScale = this.feedback / 101.0;
    const invExp4 = 1.0 / Math.exp(4.0);
    const depthScale = this.depth / 255.0;
    const old = this.old;
    let sc = this.skipcount;
    let period = sc % 20;

    for (let i = 0; i < len; i++) {
      const inVal = samples[i];
      let m = inVal + this.fbout * fbScale;

      if (period === 0) {
        let g = (1.0 + Math.cos(sc * this.lfoskip + this.phaseRad)) * 0.5;
        g = Math.exp(g * 4.0) * invExp4;
        this.gain = 1.0 - g * depthScale;
      }
      sc++;
      if (++period === 20) period = 0;

      for (let j = 0; j < numStages; j++) {
        const tmp = old[j];
        old[j] = this.gain * tmp + m;
        m = tmp - this.gain * old[j];
      }
      this.fbout = m;
      const res = m * wet + inVal * dry;
      samples[i] = res !== res ? 0 : res;
    }
    this.skipcount = sc;
  }
}

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

// 10. LFOPhaser: SWH 6-stage allpass phaser with modulated LFO
export class LFOPhaserFilter extends BaseDspFilter {
  lfoRate = 0.001;
  lfoDepth = 0.0;
  fb = 0.0;
  spread = 1.0;

  private ap = Array.from({ length: 6 }, () => new PhasersAllPass());
  private lfoTbl = new Float32Array(4096);
  private ym1 = 0;
  private lfoPos = 0;
  private fPerLv = 0;
  private count = 0;
  private mod = 1;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    let p = 0;
    for (let i = 0; i < 4096; i++) {
      p += Math.PI * 0.0004882812;
      this.lfoTbl[i] = (Math.sin(p) + 1.1) * 0.25;
    }
    this.fPerLv = sampleRate * 0.0002441406;
    this.init();
  }

  init(): void {
    this.ym1 = 0;
    this.lfoPos = 0;
    this.count = 0;
    for (let i = 0; i < 6; i++) this.ap[i].clear();
    this.mod = Math.max(1, Math.round(this.fPerLv / (this.lfoRate + 1e-6)));
  }

  randomize(): void {
    this.lfoRate = 0.01 + Math.random() * 100;
    this.lfoDepth = Math.random();
    this.fb = -1 + Math.random() * 2;
    this.spread = Math.random() * 2;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.lfoRate !== undefined) this.lfoRate = p.lfoRate;
    if (p.lfoDepth !== undefined) this.lfoDepth = p.lfoDepth;
    if (p.fb !== undefined) this.fb = p.fb;
    if (p.spread !== undefined) this.spread = p.spread;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      lfoRate: this.lfoRate,
      lfoDepth: this.lfoDepth,
      fb: this.fb,
      spread: this.spread,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const mod = this.mod;
    let count = this.count;
    const ap = this.ap;
    const lfoTbl = this.lfoTbl;
    const lfoDepth = this.lfoDepth;
    const spreadConst = this.spread * 0.01562;
    const fb = this.fb;
    let ym1 = this.ym1;

    for (let i = 0; i < len; i++) {
      if (++count >= mod) {
        this.lfoPos = (this.lfoPos + 1) & 0x7ff;
        count = 0;
        const d = lfoTbl[this.lfoPos] * lfoDepth;
        ap[0].setDelay(d);
        let ofs = spreadConst;
        for (let j = 1; j < 6; j++) {
          ap[j].setDelay(d + ofs);
          ofs *= 2.0;
        }
      }

      let y = ap[0].run(samples[i] + ym1 * fb);
      for (let j = 1; j < 6; j++) y = ap[j].run(y);
      ym1 = y;
      samples[i] = y !== y ? 0 : y;
    }
    this.count = count;
    this.ym1 = ym1;
  }
}

// 11. FourByFourPole: SWH 16 allpass stages filter bank (4 poles x 4 stages)
export class FourByFourPoleFilter extends BaseDspFilter {
  f0 = 10;
  fb0 = 0;
  f1 = 10000;
  fb1 = 0;
  f2 = 15000;
  fb2 = 0;
  f3 = 20000;
  fb3 = 0;

  private ap = Array.from({ length: 16 }, () => new PhasersAllPass());
  private y0 = 0;
  private y1 = 0;
  private y2 = 0;
  private y3 = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    const rs = this.invSampleRate;
    let idx = 0;
    for (let i = 0; i < 4; i++) this.ap[idx++].setDelay(this.f0 * rs);
    for (let i = 0; i < 4; i++) this.ap[idx++].setDelay(this.f1 * rs);
    for (let i = 0; i < 4; i++) this.ap[idx++].setDelay(this.f2 * rs);
    for (let i = 0; i < 4; i++) this.ap[idx++].setDelay(this.f3 * rs);
    this.y0 = this.y1 = this.y2 = this.y3 = 0;
  }

  randomize(): void {
    this.f0 = Math.random() * 20000;
    this.f1 = Math.random() * 20000;
    this.f2 = Math.random() * 20000;
    this.f3 = Math.random() * 20000;
    this.fb0 = -1 + Math.random() * 2;
    this.fb1 = -1 + Math.random() * 2;
    this.fb2 = -1 + Math.random() * 2;
    this.fb3 = -1 + Math.random() * 2;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.f0 !== undefined) this.f0 = p.f0;
    if (p.fb0 !== undefined) this.fb0 = p.fb0;
    if (p.f1 !== undefined) this.f1 = p.f1;
    if (p.fb1 !== undefined) this.fb1 = p.fb1;
    if (p.f2 !== undefined) this.f2 = p.f2;
    if (p.fb2 !== undefined) this.fb2 = p.fb2;
    if (p.f3 !== undefined) this.f3 = p.f3;
    if (p.fb3 !== undefined) this.fb3 = p.fb3;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      f0: this.f0,
      fb0: this.fb0,
      f1: this.f1,
      fb1: this.fb1,
      f2: this.f2,
      fb2: this.fb2,
      f3: this.f3,
      fb3: this.fb3,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    for (let i = 0; i < len; i++) {
      const s = samples[i];
      let idx = 0;
      this.y0 = this.ap[idx++].run(s + this.y0 * this.fb0);
      this.y0 = this.ap[idx++].run(this.y0);
      this.y0 = this.ap[idx++].run(this.y0);
      this.y0 = this.ap[idx++].run(this.y0);

      this.y1 = this.ap[idx++].run(this.y0 + this.y1 * this.fb1);
      this.y1 = this.ap[idx++].run(this.y1);
      this.y1 = this.ap[idx++].run(this.y1);
      this.y1 = this.ap[idx++].run(this.y1);

      this.y2 = this.ap[idx++].run(this.y1 + this.y2 * this.fb2);
      this.y2 = this.ap[idx++].run(this.y2);
      this.y2 = this.ap[idx++].run(this.y2);
      this.y2 = this.ap[idx++].run(this.y2);

      this.y3 = this.ap[idx++].run(this.y2 + this.y3 * this.fb3);
      this.y3 = this.ap[idx++].run(this.y3);
      this.y3 = this.ap[idx++].run(this.y3);
      this.y3 = this.ap[idx++].run(this.y3);

      samples[i] = this.y3 !== this.y3 ? 0 : this.y3;
    }
  }
}

// 12. AutoPhaser: Envelope-follower controlled dynamic phaser
export class AutoPhaserFilter extends BaseDspFilter {
  attackP = 0.1;
  decayP = 0.1;
  depthP = 0.1;
  fb = 0.0;
  spread = 1.0;

  private ap = Array.from({ length: 6 }, () => new PhasersAllPass());
  private env = new PhasersEnvelope();
  private ym1 = 0;
  private count = 0;
  private depth = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.ym1 = 0;
    this.count = 0;
    for (let i = 0; i < 6; i++) this.ap[i].clear();
    this.env.setAttack(this.attackP * this.sampleRate * 0.25);
    this.env.setRelease(this.decayP * this.sampleRate * 0.25);
    this.depth = 0.5 * this.depthP;
  }

  randomize(): void {
    this.attackP = Math.random();
    this.decayP = Math.random();
    this.depthP = Math.random();
    this.fb = -1 + Math.random() * 2;
    this.spread = Math.random() * 2;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.attackP !== undefined) this.attackP = p.attackP;
    if (p.decayP !== undefined) this.decayP = p.decayP;
    if (p.depthP !== undefined) this.depthP = p.depthP;
    if (p.fb !== undefined) this.fb = p.fb;
    if (p.spread !== undefined) this.spread = p.spread;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      attackP: this.attackP,
      decayP: this.decayP,
      depthP: this.depthP,
      fb: this.fb,
      spread: this.spread,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const ap = this.ap;
    const env = this.env;
    const depth = this.depth;
    const spreadConst = this.spread * 0.01562;
    const fb = this.fb;
    let ym1 = this.ym1;
    let count = this.count;

    for (let i = 0; i < len; i++) {
      const s = samples[i];
      if ((count++ & 3) === 0) {
        const d = env.run(s) * depth;
        ap[0].setDelay(d);
        let ofs = spreadConst;
        for (let j = 1; j < 6; j++) {
          ap[j].setDelay(d + ofs);
          ofs *= 2.0;
        }
      }
      let y = ap[0].run(s + ym1 * fb);
      for (let j = 1; j < 6; j++) y = ap[j].run(y);
      ym1 = y;
      samples[i] = y !== y ? 0 : y;
    }
    this.count = count;
    this.ym1 = ym1;
  }
}

// 13. TapAutopan: Stereo panning modulation
export class TapAutopanFilter extends BaseDspFilter {
  freq = 5.0;
  depth = 10.0;
  gain = 1.0;
  phaseStep = 10.0;

  private phase = 0.0;
  private cosTable = new Float32Array(1024);

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    for (let i = 0; i < 1024; i++) {
      this.cosTable[i] = Math.cos((i * Math.PI) / 512.0);
    }
    this.init();
  }

  init(): void {
    this.phase = 0.0;
  }

  randomize(): void {
    this.freq = Math.random() * 20;
    this.depth = Math.random() * 100;
    this.gain = -20 + Math.random() * 40;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = p.freq;
    if (p.depth !== undefined) this.depth = p.depth;
    if (p.gain !== undefined) this.gain = p.gain;
    if (p.phaseStep !== undefined) this.phaseStep = p.phaseStep;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      freq: this.freq,
      depth: this.depth,
      gain: this.gain,
      phaseStep: this.phaseStep,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const gLinear = this.gain > -90.0 ? Math.pow(10.0, this.gain * 0.05) : 0.0;
    const dNorm = this.depth / 100.0;
    const pStep = 1.0 / Math.max(1e-6, this.phaseStep);
    const cosTbl = this.cosTable;

    const phaseInc = (1024.0 * this.freq) / this.sampleRate + pStep;
    let ph = this.phase;

    const baseMod = gLinear * (1 - 0.5 * dNorm);
    const modScale = gLinear * (0.5 * dNorm);

    for (let i = 0; i < len; i += 2) {
      const idxL = (ph | 0) & 1023;
      const idxR = (idxL + 512) & 1023;

      const leftMod = baseMod + modScale * cosTbl[idxL];
      const rightMod = baseMod + modScale * cosTbl[idxR];

      samples[i] *= leftMod;
      if (i + 1 < len) {
        samples[i + 1] *= rightMod;
      }

      ph += phaseInc;
      if (ph >= 1024.0) ph -= 1024.0;
    }

    this.phase = ph;
  }
}
