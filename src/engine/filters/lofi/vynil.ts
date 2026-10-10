import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp, lerp } from '../util.ts';
import { Biquad } from '../../biquad.ts';

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

export const filter: FilterModule = {
  descriptor: {
    id: 'vynil',
    name: 'Vinyl Record Dust',
    category: 'lofi',
    description: 'Mechanical turntable warp, surface wear, and clicks.',
    defaultSampleRate: 44100,
    params: [
      { name: 'year', label: 'Release Year', type: 'float', min: 1900, max: 1990, step: 1, value: 1987, tooltip: 'Bandwidth & tonal curve of the pressing era' },
      { name: 'rpm', label: 'RPM', type: 'float', min: 33, max: 78, step: 1, value: 63, tooltip: 'Turntable rotational speed in revolutions per minute' },
      { name: 'warp', label: 'Motor Warp', type: 'float', min: 0, max: 0.4, step: 0.01, value: 0.45, tooltip: 'Periodic platter pitch wow and flutter' },
      { name: 'click', label: 'Click Rate', type: 'float', min: 0, max: 1, step: 0.01, value: 0.235, tooltip: 'Frequency of surface pops and needle dust clicks' },
      { name: 'wear', label: 'Groove Wear', type: 'float', min: 0, max: 1, step: 0.01, value: 0, tooltip: 'Continuous high-frequency surface noise & hiss' },
    ],
  },
  create: (sr) => new VynilFilter(sr),
};
