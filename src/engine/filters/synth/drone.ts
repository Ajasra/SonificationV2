import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp, TWO_PI } from '../util.ts';

// 2. Oscillator / Drone: two detuned oscillators added under the input, optionally following its level.
export class DroneOscFilter extends BaseDspFilter {
  wave = 1;        // 0=Sine 1=Saw 2=Square 3=Triangle
  freq = 110;
  detune = 8;      // cents between the two oscillators
  level = 0.4;
  follow = 0.0;    // 0 = constant drone, 1 = gated by input level

  private p1 = 0;
  private p2 = 0;
  private env = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.p1 = 0;
    this.p2 = 0.37;
    this.env = 0;
  }

  randomize(): void {
    this.wave = Math.floor(Math.random() * 4);
    this.freq = 55 * Math.pow(2, Math.random() * 4);
    this.detune = Math.random() * 25;
    this.level = 0.2 + Math.random() * 0.4;
    this.follow = Math.random();
  }

  setParams(p: Record<string, number>): void {
    if (p.wave !== undefined) this.wave = clamp(Math.round(p.wave), 0, 3);
    if (p.freq !== undefined) this.freq = clamp(p.freq, 20, 2000);
    if (p.detune !== undefined) this.detune = clamp(p.detune, 0, 100);
    if (p.level !== undefined) this.level = clamp(p.level, 0, 1);
    if (p.follow !== undefined) this.follow = clamp(p.follow, 0, 1);
  }

  getParams(): Record<string, number> {
    return { wave: this.wave, freq: this.freq, detune: this.detune, level: this.level, follow: this.follow };
  }

  private shape(ph: number): number {
    switch (this.wave) {
      case 0: return Math.sin(ph * TWO_PI);
      case 1: return 2 * ph - 1;
      case 2: return ph < 0.5 ? 0.8 : -0.8;
      default: return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    }
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const inc1 = this.freq / sr;
    const inc2 = (this.freq * Math.pow(2, this.detune / 1200)) / sr;
    const lvl = this.level;
    const follow = this.follow;
    const envCoeff = 1 - Math.exp(-1 / (0.02 * sr));
    let p1 = this.p1;
    let p2 = this.p2;
    let env = this.env;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      env += (Math.min(1, Math.abs(x) * 3) - env) * envCoeff;
      const amp = lvl * (1 - follow + follow * env);
      const o = (this.shape(p1) + this.shape(p2)) * 0.5;
      p1 += inc1;
      if (p1 >= 1) p1 -= 1;
      p2 += inc2;
      if (p2 >= 1) p2 -= 1;
      samples[i] = x + o * amp;
    }

    this.p1 = p1;
    this.p2 = p2;
    this.env = env;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'drone',
    name: 'Oscillator / Drone',
    category: 'synth',
    description: 'Two detuned oscillators layered under the input, optionally following its level.',
    defaultSampleRate: 44100,
    params: [
      { name: 'wave', label: 'Wave', type: 'int', min: 0, max: 3, step: 1, value: 1, tooltip: '0=Sine, 1=Saw, 2=Square, 3=Triangle' },
      { name: 'freq', label: 'Freq (Hz)', type: 'float', min: 20, max: 2000, step: 1, value: 110, tooltip: 'Oscillator pitch' },
      { name: 'detune', label: 'Detune (cents)', type: 'float', min: 0, max: 100, step: 1, value: 8, tooltip: 'Detune between the two oscillators' },
      { name: 'level', label: 'Level', type: 'float', min: 0, max: 1, step: 0.05, value: 0.4, tooltip: 'Drone loudness' },
      { name: 'follow', label: 'Follow Input', type: 'float', min: 0, max: 1, step: 0.05, value: 0, tooltip: '0 = constant drone, 1 = gated by input level' },
    ],
  },
  create: (sr) => new DroneOscFilter(sr),
};
