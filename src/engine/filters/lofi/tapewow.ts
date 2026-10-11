import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp, SIN_TABLE, SIN_TABLE_SIZE, SIN_TABLE_MASK, RAD_TO_SIN_IDX, TWO_PI } from '../util.ts';

// 1. Tape Wow & Flutter: modulated delay line with slow wow, fast flutter and random drift.
export class TapeWowFilter extends BaseDspFilter {
  wow = 0.5;       // 0..1 slow (~0.5 Hz) pitch drift depth
  flutter = 0.3;   // 0..1 fast (~8 Hz) pitch drift depth
  drift = 0.3;     // 0..1 random walk depth
  mix = 1.0;

  private buf = new Float32Array(0);
  private bufMask = 0;
  private pos = 0;
  private wowPhase = 0;
  private flutPhase = 0;
  private noise = 0;
  private noiseTarget = 0;
  private noiseCount = 0;

  constructor(sampleRate: number = 44100, private readonly random: () => number = () => Math.random()) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    const minSize = Math.ceil(this.sampleRate * 0.08) + 4;
    const p2Size = 1 << Math.ceil(Math.log2(minSize));
    this.buf = new Float32Array(p2Size);
    this.bufMask = p2Size - 1;
    this.pos = 0;
    this.wowPhase = 0;
    this.flutPhase = 0;
    this.noise = 0;
    this.noiseTarget = 0;
    this.noiseCount = 0;
  }

  randomize(): void {
    this.wow = this.random();
    this.flutter = this.random() * 0.8;
    this.drift = this.random() * 0.8;
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
    const mask = this.bufMask;
    const cap = mask + 1;
    const sr = this.sampleRate;
    const baseDelay = sr * 0.03;
    const wowDepth = this.wow * sr * 0.008;
    const flutDepth = this.flutter * sr * 0.0015;
    const driftDepth = this.drift * sr * 0.004;
    const wpIncIdx = (0.5 / sr) * SIN_TABLE_SIZE;
    const fpIncIdx = (8.0 / sr) * SIN_TABLE_SIZE;
    const mix = this.mix;
    const dry = 1 - mix;
    const stepLen = Math.max(1, Math.floor(sr / 4));
    const noiseAlpha = 4.0 / sr;

    let pos = this.pos;
    let wpIdx = this.wowPhase * RAD_TO_SIN_IDX;
    let fpIdx = this.flutPhase * RAD_TO_SIN_IDX;
    let nz = this.noise;
    let nzT = this.noiseTarget;
    let nzC = this.noiseCount;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      buf[pos] = x;

      if (--nzC <= 0) {
        nzT = this.random() * 2 - 1;
        nzC = stepLen;
      }
      nz += (nzT - nz) * noiseAlpha;

      const sinW = SIN_TABLE[(wpIdx | 0) & SIN_TABLE_MASK];
      const sinF = SIN_TABLE[(fpIdx | 0) & SIN_TABLE_MASK];
      wpIdx += wpIncIdx;
      fpIdx += fpIncIdx;

      const d = baseDelay + wowDepth * sinW + flutDepth * sinF + driftDepth * nz;
      let rp = pos - d;
      while (rp < 0) rp += cap;

      const i0 = (rp | 0) & mask;
      const frac = rp - (rp | 0);
      const i1 = (i0 + 1) & mask;
      const a = buf[i0];
      const b = buf[i1];
      const wet = a + (b - a) * frac;

      pos = (pos + 1) & mask;
      samples[i] = x * dry + wet * mix;
    }

    this.pos = pos;
    this.wowPhase = (wpIdx / RAD_TO_SIN_IDX) % TWO_PI;
    this.flutPhase = (fpIdx / RAD_TO_SIN_IDX) % TWO_PI;
    this.noise = nz;
    this.noiseTarget = nzT;
    this.noiseCount = nzC;
  }

  /** Owned snapshot for conformance; injected random-source state is captured separately. */
  exportState() {
    return { version: 1, sampleRate: this.sampleRate, pos: this.pos,
      wowPhase: this.wowPhase, flutPhase: this.flutPhase, noise: this.noise,
      noiseTarget: this.noiseTarget, noiseCount: this.noiseCount, buffer: this.buf.slice() };
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
