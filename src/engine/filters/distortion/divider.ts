import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 19. Divider: Subharmonic zero-crossing frequency divider
export class DividerFilter extends BaseDspFilter {
  denominator = 2;

  private out = 1.0;
  private amp = 0.0;
  private count = 0.0;
  private lamp = 0.0;
  private last = 0.0;
  private zeroxs = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.out = 1.0;
    this.amp = 0.0;
    this.count = 0.0;
    this.lamp = 0.0;
    this.last = 0.0;
    this.zeroxs = 0;
  }

  randomize(): void {
    this.denominator = Math.random() < 0.8 ? Math.floor(1 + Math.random() * 11) : Math.floor(1 + Math.random() * 99);
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.denominator !== undefined) this.denominator = Math.max(1, Math.floor(p.denominator));
    this.init();
  }

  getParams(): Record<string, number> {
    return { denominator: this.denominator };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const denom = this.denominator;

    for (let i = 0; i < len; i++) {
      this.count += 1.0;
      const s = samples[i];
      if ((s > 0.0 && this.last <= 0.0) || (s < 0.0 && this.last >= 0.0)) {
        this.zeroxs++;
        if (denom === 1) {
          this.out = this.out > 0.0 ? -1.0 : 1.0;
          this.lamp = this.amp / Math.max(1, this.count);
          this.zeroxs = 0;
          this.count = 0.0;
          this.amp = 0.0;
        }
      }
      this.amp += Math.abs(s);
      if (denom > 1 && this.zeroxs % denom === denom - 1) {
        this.out = this.out > 0.0 ? -1.0 : 1.0;
        this.lamp = this.amp / Math.max(1, this.count);
        this.zeroxs = 0;
        this.count = 0.0;
        this.amp = 0.0;
      }
      this.last = s;
      const res = this.out * this.lamp;
      samples[i] = res !== res ? 0 : res;
    }
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'divider',
    name: 'Subharmonic Divider',
    category: 'distortion',
    description: 'Zero-crossing pitch flip-flop frequency divider.',
    defaultSampleRate: 44100,
    params: [
      { name: 'denominator', label: 'Divider Ratio', type: 'int', min: 1, max: 32, step: 1, value: 2, tooltip: 'Sub-octave division factor (e.g. 2 = one octave down)' },
    ],
  },
  create: (sr) => new DividerFilter(sr),
};
