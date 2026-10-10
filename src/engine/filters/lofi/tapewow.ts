import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 1. Tape Wow & Flutter: modulated delay line with slow wow, fast flutter and random drift.
export class TapeWowFilter extends BaseDspFilter {
  wow = 0.5;       // 0..1 slow (~0.5 Hz) pitch drift depth
  flutter = 0.3;   // 0..1 fast (~8 Hz) pitch drift depth
  drift = 0.3;     // 0..1 random walk depth
  mix = 1.0;

  private buf = new Float32Array(0);
  private pos = 0;
  private wowPhase = 0;
  private flutPhase = 0;
  private noise = 0;
  private noiseTarget = 0;
  private noiseCount = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.buf = new Float32Array(Math.ceil(this.sampleRate * 0.08) + 4);
    this.pos = 0;
    this.wowPhase = 0;
    this.flutPhase = 0;
    this.noise = 0;
    this.noiseTarget = 0;
    this.noiseCount = 0;
  }

  randomize(): void {
    this.wow = Math.random();
    this.flutter = Math.random() * 0.8;
    this.drift = Math.random() * 0.8;
    this.mix = 1.0;
  }

  setParams(p: Record<string, number>): void {
    if (p.wow !== undefined) this.wow = clamp(p.wow, 0, 1);
    if (p.flutter !== undefined) this.flutter = clamp(p.flutter, 0, 1);
    if (p.drift !== undefined) this.drift = clamp(p.drift, 0, 1);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return { wow: this.wow, flutter: this.flutter, drift: this.drift, mix: this.mix };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const buf = this.buf;
    const size = buf.length;
    const sr = this.sampleRate;
    const baseDelay = sr * 0.03;
    const wowDepth = this.wow * sr * 0.008;
    const flutDepth = this.flutter * sr * 0.0015;
    const driftDepth = this.drift * sr * 0.004;
    const wowInc = (0.5 / sr) * 2 * Math.PI;
    const flutInc = (8.0 / sr) * 2 * Math.PI;
    const mix = this.mix;
    const dry = 1 - mix;
    const stepLen = Math.max(1, Math.floor(sr / 4));

    let pos = this.pos;
    let wp = this.wowPhase;
    let fp = this.flutPhase;
    let nz = this.noise;
    let nzT = this.noiseTarget;
    let nzC = this.noiseCount;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      buf[pos] = x;

      if (nzC <= 0) {
        nzT = Math.random() * 2 - 1;
        nzC = stepLen;
      }
      nzC--;
      nz += (nzT - nz) * (4.0 / sr);

      const d = baseDelay + wowDepth * Math.sin(wp) + flutDepth * Math.sin(fp) + driftDepth * nz;
      wp += wowInc;
      fp += flutInc;

      let rp = pos - d;
      while (rp < 0) rp += size;
      const i0 = Math.floor(rp);
      const frac = rp - i0;
      const a = buf[i0 % size];
      const b = buf[(i0 + 1) % size];
      const wet = a + (b - a) * frac;

      if (++pos >= size) pos = 0;
      samples[i] = x * dry + wet * mix;
    }

    this.pos = pos;
    this.wowPhase = wp % (2 * Math.PI);
    this.flutPhase = fp % (2 * Math.PI);
    this.noise = nz;
    this.noiseTarget = nzT;
    this.noiseCount = nzC;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'tapewow',
    name: 'Tape Wow & Flutter',
    category: 'lofi',
    description: 'Modulated delay line imitating unstable tape transport: slow wow, fast flutter and random drift.',
    defaultSampleRate: 44100,
    params: [
      { name: 'wow', label: 'Wow', type: 'float', min: 0, max: 1, step: 0.05, value: 0.5, tooltip: 'Slow (~0.5 Hz) pitch drift depth' },
      { name: 'flutter', label: 'Flutter', type: 'float', min: 0, max: 1, step: 0.05, value: 0.3, tooltip: 'Fast (~8 Hz) pitch wobble depth' },
      { name: 'drift', label: 'Drift', type: 'float', min: 0, max: 1, step: 0.05, value: 0.3, tooltip: 'Random-walk speed instability' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'Dry/wet balance' },
    ],
  },
  create: (sr) => new TapeWowFilter(sr),
};
