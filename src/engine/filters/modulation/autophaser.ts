import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { PhasersAllPass, PhasersEnvelope } from './phaser-shared.ts';

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

export const filter: FilterModule = {
  descriptor: {
    id: 'autophaser',
    name: 'Auto Phaser',
    category: 'modulation',
    description: 'Dynamic phaser controlled by an envelope follower.',
    defaultSampleRate: 44100,
    params: [
      { name: 'attackP', label: 'Attack', type: 'float', min: 0.01, max: 1, step: 0.01, value: 0.1, tooltip: 'Envelope follower rise time' },
      { name: 'decayP', label: 'Decay', type: 'float', min: 0.01, max: 1, step: 0.01, value: 0.1, tooltip: 'Envelope follower fall time' },
      { name: 'depthP', label: 'Depth', type: 'float', min: 0.01, max: 1, step: 0.01, value: 0.1, tooltip: 'Envelope-to-filter modulation amount' },
      { name: 'fb', label: 'Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.01, value: 0, tooltip: 'Phaser loop feedback' },
    ],
  },
  create: (sr) => new AutoPhaserFilter(sr),
};
