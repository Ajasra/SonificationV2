import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { PhasersAllPass } from './phaser-shared.ts';

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

export const filter: FilterModule = {
  descriptor: {
    id: 'lfophaser',
    name: 'LFO Phaser',
    category: 'modulation',
    description: 'SWH 6-stage allpass phaser.',
    defaultSampleRate: 44100,
    params: [
      { name: 'lfoRate', label: 'LFO Rate', type: 'float', min: 0.001, max: 50, step: 0.01, value: 0.001, tooltip: 'LFO cycle rate in Hz' },
      { name: 'lfoDepth', label: 'Depth', type: 'float', min: 0, max: 1, step: 0.01, value: 0.5, tooltip: 'Phase modulation depth' },
      { name: 'fb', label: 'Feedback', type: 'float', min: -0.99, max: 0.99, step: 0.01, value: 0, tooltip: 'Regenerative stage feedback' },
      { name: 'spread', label: 'Spread', type: 'float', min: 0.1, max: 3, step: 0.1, value: 1, tooltip: 'Pole frequency separation spread' },
    ],
  },
  create: (sr) => new LFOPhaserFilter(sr),
};
