import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 6. CanyonDelay: Stereo cross-coupled feedback delay
export class CanyonDelayFilter extends BaseDspFilter {
  ltrTime = 0.5;
  rtlTime = 0.5;
  ltrFeedback = 0.1;
  rtlFeedback = -0.1;
  cutoff = 1000.0;

  private dataL = new Float32Array(192000);
  private dataR = new Float32Array(192000);
  private dataSize = 0;
  private pos = 0;
  private accumL = 0;
  private accumR = 0;
  private ltrOffset = 0;
  private rtlOffset = 0;
  private ltrInvmag = 0;
  private rtlInvmag = 0;
  private filterInvmag = 0;
  private filterMag = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.dataSize = Math.max(1, Math.min(192000, Math.floor(this.sampleRate) + 1));
    this.dataL.fill(0);
    this.dataR.fill(0);
    this.pos = 0;
    this.accumL = 0;
    this.accumR = 0;
    this.ltrOffset = Math.floor(this.ltrTime * this.sampleRate);
    this.rtlOffset = Math.floor(this.rtlTime * this.sampleRate);
    this.ltrInvmag = 1.0 - Math.abs(this.ltrFeedback);
    this.rtlInvmag = 1.0 - Math.abs(this.rtlFeedback);
    this.filterInvmag = Math.pow(0.5, 4.0 * Math.PI * this.cutoff * this.invSampleRate);
    this.filterMag = 1.0 - this.filterInvmag;
  }

  randomize(): void {
    this.ltrTime = 0.001 + Math.random();
    this.rtlTime = 0.001 + Math.random();
    this.ltrFeedback = -1 + Math.random() * 2;
    this.rtlFeedback = -1 + Math.random() * 2;
    this.cutoff = Math.random() * 10000;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.ltrTime !== undefined) this.ltrTime = p.ltrTime;
    if (p.rtlTime !== undefined) this.rtlTime = p.rtlTime;
    if (p.ltrFeedback !== undefined) this.ltrFeedback = p.ltrFeedback;
    if (p.rtlFeedback !== undefined) this.rtlFeedback = p.rtlFeedback;
    if (p.cutoff !== undefined) this.cutoff = p.cutoff;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      ltrTime: this.ltrTime,
      rtlTime: this.rtlTime,
      ltrFeedback: this.ltrFeedback,
      rtlFeedback: this.rtlFeedback,
      cutoff: this.cutoff,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const dSize = this.dataSize;
    let pos = this.pos;
    let pos1 = ((pos - this.rtlOffset) % dSize + dSize) % dSize;
    let pos2 = ((pos - this.ltrOffset) % dSize + dSize) % dSize;
    let accL = this.accumL;
    let accR = this.accumR;

    const rtlInv = this.rtlInvmag;
    const rtlFb = this.rtlFeedback;
    const ltrInv = this.ltrInvmag;
    const ltrFb = this.ltrFeedback;
    const fInv = this.filterInvmag;
    const fMag = this.filterMag;
    const dL = this.dataL;
    const dR = this.dataR;

    for (let i = 0; i < len; i += 2) {
      let l = samples[i];
      let r = i + 1 < len ? samples[i + 1] : l;

      l = l * rtlInv + dR[pos1] * rtlFb;
      r = r * ltrInv + dL[pos2] * ltrFb;

      l = accL * fInv + l * fMag;
      r = accR * fInv + r * fMag;

      accL = l;
      accR = r;

      dL[pos] = l;
      dR[pos] = r;

      samples[i] = l !== l ? 0 : l;
      if (i + 1 < len) samples[i + 1] = r !== r ? 0 : r;

      if (++pos >= dSize) pos = 0;
      if (++pos1 >= dSize) pos1 = 0;
      if (++pos2 >= dSize) pos2 = 0;
    }

    this.pos = pos;
    this.accumL = accL;
    this.accumR = accR;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'canyondelay',
    name: 'Canyon Delay',
    category: 'delay',
    description: 'Stereo cross-feedback echo with lowpass damping.',
    defaultSampleRate: 44100,
    params: [
      { name: 'ltrTime', label: 'Left Time (s)', type: 'float', min: 0.001, max: 1.0, step: 0.005, value: 0.5, tooltip: 'Left-channel delay time' },
      { name: 'rtlTime', label: 'Right Time (s)', type: 'float', min: 0.001, max: 1.0, step: 0.005, value: 0.5, tooltip: 'Right-channel delay time' },
      { name: 'ltrFeedback', label: 'Left Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.01, value: 0.1, tooltip: 'Left-to-right feedback amount' },
      { name: 'rtlFeedback', label: 'Right Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.01, value: -0.1, tooltip: 'Right-to-left feedback amount' },
      { name: 'cutoff', label: 'Cutoff (Hz)', type: 'float', min: 100, max: 15000, step: 50, value: 1000, tooltip: 'High-frequency damping cutoff' },
    ],
  },
  create: (sr) => new CanyonDelayFilter(sr),
};
