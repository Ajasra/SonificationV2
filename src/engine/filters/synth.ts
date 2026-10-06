// Synths and Physical Models: Vcf303 (TB-303 Acid Filter), PluckedString (Karplus-Strong)
import { BaseDspFilter } from './base.ts';

// 14. Vcf303: Roland TB-303 Voltage Controlled Filter Emulation
export class Vcf303Filter extends BaseDspFilter {
  envMod = 0.5;
  cutoff = 0.5;
  resonance = 1.0;
  decay = 1.0;
  trigger = 0.001;

  private d1 = 0;
  private d2 = 0;
  private c0 = 0;
  private dec = 0;
  private res = 0;
  private e0 = 0;
  private scale = 0;
  private envpos = 0;
  private a = 0;
  private b = 0;
  private c = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.scale = Math.PI * this.invSampleRate;
    this.init();
  }

  init(): void {
    this.scale = Math.PI * this.invSampleRate;
    this.d1 = this.d2 = this.c0 = 0.0;
    this.envpos = 0;

    this.e0 = Math.exp(5.613 - 0.8 * this.envMod + 2.1553 * this.cutoff - 0.7696 * (1.0 - this.resonance));
    this.e0 *= this.scale;

    if (this.trigger > 0) {
      const e1 =
        Math.exp(6.109 + 1.5876 * this.envMod + 2.1553 * this.cutoff - 1.2 * (1.0 - this.resonance)) *
        this.scale;
      this.c0 = e1 - this.e0;
    }

    let d = (0.2 + 2.3 * this.decay) * this.sampleRate;
    d = Math.pow(0.1, 1.0 / Math.max(1, d));
    this.dec = Math.pow(d, 64);
    this.res = Math.exp(-1.2 + 3.455 * this.resonance);
    this.recalcABC();
  }

  private recalcABC(): void {
    const whopping = this.e0 + this.c0;
    const k = Math.exp(-whopping / Math.max(1e-6, this.res));
    this.a = 2.0 * Math.cos(2.0 * whopping) * k;
    this.b = -k * k;
    this.c = (1.0 - this.a - this.b) * 0.2;
  }

  randomize(): void {
    this.envMod = Math.random();
    this.cutoff = Math.random();
    this.resonance = Math.random();
    this.decay = Math.random();
    this.trigger = Math.random() < 0.2 ? Math.random() * 0.02 : 0;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.envMod !== undefined) this.envMod = p.envMod;
    if (p.cutoff !== undefined) this.cutoff = p.cutoff;
    if (p.resonance !== undefined) this.resonance = p.resonance;
    if (p.decay !== undefined) this.decay = p.decay;
    if (p.trigger !== undefined) this.trigger = p.trigger;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      envMod: this.envMod,
      cutoff: this.cutoff,
      resonance: this.resonance,
      decay: this.decay,
      trigger: this.trigger,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    let d1 = this.d1;
    let d2 = this.d2;
    let a = this.a;
    let b = this.b;
    let c = this.c;
    let envpos = this.envpos;
    const trig = this.trigger;

    for (let i = 0; i < len; i++) {
      const inVal = samples[i];
      const sample = a * d1 + b * d2 + c * inVal;
      d2 = d1;
      d1 = sample;

      envpos++;
      if (envpos >= 64) {
        envpos = 0;
        if (trig > 0 && Math.random() < trig * 64) {
          this.d1 = d1;
          this.d2 = d2;
          this.envpos = 0;
          this.init();
          d1 = this.d1;
          d2 = this.d2;
          a = this.a;
          b = this.b;
          c = this.c;
        } else {
          this.c0 *= this.dec;
          this.recalcABC();
          a = this.a;
          b = this.b;
          c = this.c;
        }
      }

      samples[i] = sample;
    }

    this.d1 = d1;
    this.d2 = d2;
    this.envpos = envpos;
  }
}

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
