import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 15. PluckedString: Karplus-Strong string synthesis
export class PluckedStringFilter extends BaseDspFilter {
  freq = 1000;
  sharp = 0.5;

  private history = new Float32Array(48000);
  private historyPos = 0;
  private historyLength = 0;
  private loopDelay = 0;
  private a = 0;
  private previousV = 0;
  private previousW = 0;
  private powsharp = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.historyLength = Math.max(1, Math.min(48000, Math.floor(this.sampleRate / 20.0)));
    this.historyPos = 0;
    this.history.fill(0);

    const freqRad = 2 * Math.PI * this.freq * this.invSampleRate;
    const delay = this.sampleRate / Math.max(1, this.freq);
    this.loopDelay = Math.floor(delay - 0.5);
    const phaseDelay = delay - (this.loopDelay + 0.5);
    this.powsharp = this.sharp;
    this.a =
      ((Math.sin(1 - phaseDelay) * freqRad) / 2) /
      Math.max(1e-6, (Math.sin(1 + phaseDelay) * freqRad) / 2);
  }

  randomize(): void {
    this.freq = 20 + Math.random() * 15980;
    this.sharp = 0.4 + Math.random() * 0.6;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = p.freq;
    if (p.sharp !== undefined) this.sharp = p.sharp;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      freq: this.freq,
      sharp: this.sharp,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const hLen = this.historyLength;
    const loopDel = this.loopDelay;
    const pows = this.powsharp;
    const a = this.a;
    let hPos = this.historyPos;
    let prevV = this.previousV;
    let prevW = this.previousW;

    let targetIdx = ((hPos + loopDel) % hLen + hLen) % hLen;
    const hist = this.history;

    for (let i = 0; i < len; i++) {
      const inVal = samples[i];
      const w = inVal * (1 - pows) + pows * hist[hPos];
      const v = a * w + prevW - a * prevV;
      const res = (v + prevV) * 0.5;

      hist[targetIdx] = res;
      prevV = v;
      prevW = w;

      if (++hPos >= hLen) hPos = 0;
      if (++targetIdx >= hLen) targetIdx = 0;

      samples[i] = res !== res ? 0 : res;
    }

    this.historyPos = hPos;
    this.previousV = prevV;
    this.previousW = prevW;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'plucked',
    name: 'Plucked String',
    category: 'synth',
    description: 'Karplus-Strong physical string synthesis model.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Freq (Hz)', type: 'float', min: 40, max: 8000, step: 10, value: 1000, tooltip: 'Fundamental string resonance pitch' },
      { name: 'sharp', label: 'Sharpness', type: 'float', min: 0.1, max: 0.99, step: 0.01, value: 0.5, tooltip: 'High-frequency string damping and decay length' },
    ],
  },
  create: (sr) => new PluckedStringFilter(sr),
};
