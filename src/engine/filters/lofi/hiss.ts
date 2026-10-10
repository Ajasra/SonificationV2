import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// Cassette Hiss: tilted noise floor that ducks when the signal is loud.
export class CassetteHissFilter extends BaseDspFilter {
  level = 0.05;
  tilt = 0.5;
  ducking = 0.5;

  private lp = 0;
  private env = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.lp = 0;
    this.env = 0;
  }

  randomize(): void {
    this.level = Math.random() * 0.15;
    this.tilt = Math.random();
    this.ducking = Math.random();
  }

  setParams(p: Record<string, number>): void {
    if (p.level !== undefined) this.level = clamp(p.level, 0, 0.5);
    if (p.tilt !== undefined) this.tilt = clamp(p.tilt, 0, 1);
    if (p.ducking !== undefined) this.ducking = clamp(p.ducking, 0, 1);
  }

  getParams(): Record<string, number> {
    return { level: this.level, tilt: this.tilt, ducking: this.ducking };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const envRel = Math.exp(-1 / (0.15 * this.sampleRate));
    const lpA = 0.05 + 0.9 * (1 - this.tilt); // tilt 1 = bright hiss, 0 = dark/pink
    const level = this.level;
    const duck = this.ducking;
    let lp = this.lp;
    let env = this.env;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      const a = Math.abs(x);
      env = a > env ? a : envRel * env;
      const white = Math.random() * 2 - 1;
      lp += lpA * (white - lp);
      const hiss = (this.tilt * white + (1 - this.tilt) * lp * 1.5) * level;
      samples[i] = x + hiss * (1 - duck * Math.min(1, env * 4));
    }

    this.lp = lp;
    this.env = env;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'hiss',
    name: 'Cassette Hiss',
    category: 'lofi',
    description: 'Tape noise floor with adjustable tilt that ducks under loud signal.',
    defaultSampleRate: 44100,
    params: [
      { name: 'level', label: 'Level', type: 'float', min: 0, max: 0.5, step: 0.01, value: 0.05, tooltip: 'Hiss loudness' },
      { name: 'tilt', label: 'Tilt', type: 'float', min: 0, max: 1, step: 0.05, value: 0.5, tooltip: '0 = dark/pink, 1 = bright/white' },
      { name: 'ducking', label: 'Ducking', type: 'float', min: 0, max: 1, step: 0.05, value: 0.5, tooltip: 'How much hiss is hidden while signal is loud' },
    ],
  },
  create: (sr) => new CassetteHissFilter(sr),
};
