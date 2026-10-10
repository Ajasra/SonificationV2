import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

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

export const filter: FilterModule = {
  descriptor: {
    id: 'phaser',
    name: 'Audacity Phaser',
    category: 'modulation',
    description: 'Multi-stage allpass phaser with exponential LFO.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'LFO Freq (Hz)', type: 'float', min: 0.01, max: 30, step: 0.05, value: 0.4, tooltip: 'Modulation sweep speed' },
      { name: 'stages', label: 'Stages', type: 'int', min: 1, max: 24, step: 1, value: 2, tooltip: 'Number of allpass phase-shift stages' },
      { name: 'dryWet', label: 'Dry/Wet', type: 'int', min: 0, max: 255, step: 1, value: 128, tooltip: 'Mix balance between dry and phased signal' },
      { name: 'depth', label: 'Depth', type: 'int', min: 0, max: 255, step: 1, value: 100, tooltip: 'Frequency sweep range width' },
      { name: 'feedback', label: 'Feedback', type: 'float', min: -95, max: 95, step: 1, value: 0, tooltip: 'Resonance feedback across stages' },
    ],
  },
  create: (sr) => new AuPhaserFilter(sr),
};
