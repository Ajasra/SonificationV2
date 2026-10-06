// Delay and Echo filters: Comb, AuEcho, CanyonDelay, TReverb
import { BaseDspFilter } from './base.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// 4. Comb: Feedback comb filter with cubic interpolation (LADSPA comb_1190)
export class CombFilter extends BaseDspFilter {
  freq = 100;
  feedback = 0.1;

  private static readonly COMB_SIZE = 0x4000; // 16384 (power of 2)
  private static readonly COMB_MASK = 0x3fff;

  private buffer = new Float32Array(CombFilter.COMB_SIZE);
  private pos = 0;
  private offset = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.buffer.fill(0);
    this.pos = 0;
    this.offset = clamp(this.sampleRate / this.freq, 0, CombFilter.COMB_MASK);
  }

  randomize(): void {
    this.freq = 16 + Math.random() * 624;
    this.feedback = -1 + Math.random() * 2;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = p.freq;
    if (p.feedback !== undefined) this.feedback = p.feedback;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      freq: this.freq,
      feedback: this.feedback,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const buf = this.buffer;
    const mask = CombFilter.COMB_MASK;
    const fb = this.feedback;
    const ofs = this.offset;
    let pos = this.pos;

    // Precompute constant offset and cubic polynomial weights for the block
    const ofsInt = Math.floor(ofs);
    const fr = ofs - ofsInt;
    const w0 = 0.5 * fr * (-1.0 + fr * (2.0 - fr));
    const w1 = 1.0 + 0.5 * fr * fr * (3.0 * fr - 5.0);
    const w2 = 0.5 * fr * (1.0 + fr * (4.0 - 3.0 * fr));
    const w3 = 0.5 * fr * fr * (fr - 1.0);

    for (let i = 0; i < len; i++) {
      const dataPos = pos - ofsInt;
      const interp =
        w0 * buf[(dataPos - 1) & mask] +
        w1 * buf[dataPos & mask] +
        w2 * buf[(dataPos + 1) & mask] +
        w3 * buf[(dataPos + 2) & mask];

      const inSample = samples[i];
      buf[pos] = inSample + fb * interp;
      const result = (inSample + interp) * 0.5;
      pos = (pos + 1) & mask;
      samples[i] = result !== result ? 0 : result;
    }
    this.pos = pos;
  }
}

// 5. AuEcho: Audacity Echo effect
export class AuEchoFilter extends BaseDspFilter {
  delay = 0.5; // seconds
  decay = 0.5;

  private history = new Float32Array(96000); // Preallocated max buffer
  private histLen = 0;
  private histPos = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.histLen = Math.max(1, Math.min(96000, Math.floor(this.sampleRate * this.delay)));
    this.history.fill(0);
    this.histPos = 0;
  }

  randomize(): void {
    this.delay = 0.001 + Math.random() * 0.999;
    this.decay = Math.random();
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.delay !== undefined) this.delay = p.delay;
    if (p.decay !== undefined) this.decay = p.decay;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      delay: this.delay,
      decay: this.decay,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const hist = this.history;
    const hLen = this.histLen;
    let hPos = this.histPos;
    const dec = this.decay;

    for (let i = 0; i < len; i++) {
      if (hPos >= hLen) hPos = 0;
      const delayed = hist[hPos];
      const result = samples[i] + delayed * dec;
      hist[hPos] = result;
      hPos++;
      samples[i] = result !== result ? 0 : result;
    }
    this.histPos = hPos;
  }
}

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
    let accL = this.accumL;
    let accR = this.accumR;

    for (let i = 0; i < len; i += 2) {
      let l = samples[i];
      let r = i + 1 < len ? samples[i + 1] : l;

      const pos1 = (pos - this.rtlOffset + dSize) % dSize;
      const pos2 = (pos - this.ltrOffset + dSize) % dSize;

      l = l * this.rtlInvmag + this.dataR[pos1] * this.rtlFeedback;
      r = r * this.ltrInvmag + this.dataL[pos2] * this.ltrFeedback;

      l = accL * this.filterInvmag + l * this.filterMag;
      r = accR * this.filterInvmag + r * this.filterMag;

      accL = l;
      accR = r;

      this.dataL[pos] = l;
      this.dataR[pos] = r;

      samples[i] = l !== l ? 0 : l;
      if (i + 1 < len) samples[i + 1] = r !== r ? 0 : r;

      pos = (pos + 1) % dSize;
    }

    this.pos = pos;
    this.accumL = accL;
    this.accumR = accR;
  }
}

// 7. TReverb: Reverb delay with preallocated ring buffer (eliminating old Processing ArrayList autoboxing!)
export class TReverbFilter extends BaseDspFilter {
  delayMs = 2000;
  decay = 0.5;

  private buffer = new Float32Array(524288); // Preallocated power-of-two 512k ring buffer
  private bufferMask = 524287;
  private delSample = 0;
  private head = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.delSample = Math.min(this.bufferMask, Math.floor((this.delayMs * this.sampleRate) / 1000));
    this.buffer.fill(0);
    this.head = 0;
  }

  randomize(): void {
    this.decay = 0.1 + Math.random() * 0.87;
    this.delayMs = 1 + Math.random() * 9000;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.delayMs !== undefined) this.delayMs = p.delayMs;
    if (p.decay !== undefined) this.decay = p.decay;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      delayMs: this.delayMs,
      decay: this.decay,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const buf = this.buffer;
    const mask = this.bufferMask;
    const del = this.delSample;
    const dec = this.decay;
    let head = this.head;

    for (let i = 0; i < len; i++) {
      const inVal = samples[i];
      const readIdx = (head - del + mask + 1) & mask;
      const prev = buf[readIdx];
      const out = inVal + prev * dec;
      buf[head] = inVal;
      head = (head + 1) & mask;
      samples[i] = out !== out ? 0 : out;
    }
    this.head = head;
  }
}
