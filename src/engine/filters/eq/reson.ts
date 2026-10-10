import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

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

export const filter: FilterModule = {
  descriptor: {
    id: 'reson',
    name: 'Reson Filter',
    category: 'eq',
    description: 'Two-pole resonant bandpass filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freqControl', label: 'Frequency (Hz)', type: 'float', min: 20, max: 10000, step: 10, value: 500, tooltip: 'Center resonant frequency' },
      { name: 'bwControl', label: 'Bandwidth (Hz)', type: 'float', min: 50, max: 2000, step: 10, value: 1000, tooltip: 'Resonance bandwidth / sharpness' },
    ],
  },
  create: (sr) => new ResonFilter(sr),
};
