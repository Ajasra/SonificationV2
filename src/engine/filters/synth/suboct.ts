import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// Sub Oscillator: octave-down square(s) derived from the input's zero crossings (Schmitt trigger flip-flops).
export class SubOscFilter extends BaseDspFilter {
  octaves = 1;     // 1 or 2 octaves down
  level = 0.6;
  lowpass = 150;

  private detLp = 0;
  private armed = true;
  private ff1 = 1;
  private ff2 = 1;
  private outLp = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.detLp = 0;
    this.armed = true;
    this.ff1 = 1;
    this.ff2 = 1;
    this.outLp = 0;
  }

  randomize(): void {
    this.octaves = 1 + Math.round(Math.random());
    this.level = 0.3 + Math.random() * 0.6;
    this.lowpass = 60 + Math.random() * 300;
  }

  setParams(p: Record<string, number>): void {
    if (p.octaves !== undefined) this.octaves = clamp(Math.round(p.octaves), 1, 2);
    if (p.level !== undefined) this.level = clamp(p.level, 0, 1);
    if (p.lowpass !== undefined) this.lowpass = clamp(p.lowpass, 40, 400);
  }

  getParams(): Record<string, number> {
    return { octaves: this.octaves, level: this.level, lowpass: this.lowpass };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const detA = 1 - Math.exp((-2 * Math.PI * 600) / sr);
    const outA = 1 - Math.exp((-2 * Math.PI * this.lowpass) / sr);
    const level = this.level;
    const two = this.octaves === 2;
    let detLp = this.detLp, armed = this.armed, ff1 = this.ff1, ff2 = this.ff2, outLp = this.outLp;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      detLp += detA * (x - detLp);

      // Schmitt trigger: arm below -0.02, fire on rising through +0.02
      if (detLp < -0.02) armed = true;
      else if (armed && detLp > 0.02) {
        armed = false;
        ff1 = -ff1;
        if (ff1 > 0) ff2 = -ff2;
      }

      const sq = two ? ff2 : ff1;
      outLp += outA * (sq - outLp);
      samples[i] = x + outLp * level;
    }

    this.detLp = detLp; this.armed = armed; this.ff1 = ff1; this.ff2 = ff2; this.outLp = outLp;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'suboct',
    name: 'Sub Oscillator',
    category: 'synth',
    description: 'Octave-down square wave tracking the input pitch, via zero-crossing flip-flops.',
    defaultSampleRate: 44100,
    params: [
      { name: 'octaves', label: 'Octaves Down', type: 'int', min: 1, max: 2, step: 1, value: 1, tooltip: '1 or 2 octaves below the input' },
      { name: 'level', label: 'Level', type: 'float', min: 0, max: 1, step: 0.05, value: 0.6, tooltip: 'Sub level mixed under the input' },
      { name: 'lowpass', label: 'Lowpass (Hz)', type: 'float', min: 40, max: 400, step: 5, value: 150, tooltip: 'Smooths the sub square toward a sine' },
    ],
  },
  create: (sr) => new SubOscFilter(sr),
};
