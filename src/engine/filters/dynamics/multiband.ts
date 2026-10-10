import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// Multiband Compressor (3 bands): complementary 12 dB/oct crossovers, so the bands always sum back to the input.
export class MultibandCompFilter extends BaseDspFilter {
  xLow = 200;
  xHigh = 2500;
  threshold = -20;
  ratio = 3;
  low = 1;
  mid = 1;
  high = 1;
  attack = 10;
  release = 120;
  makeup = 3;

  // lowpass cascades: A at xLow, B at xHigh (two one-poles each)
  private a1 = 0;
  private a2 = 0;
  private b1 = 0;
  private b2 = 0;
  private env = new Float64Array(3);

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.a1 = this.a2 = this.b1 = this.b2 = 0;
    this.env.fill(0);
  }

  randomize(): void {
    this.xLow = 100 + Math.random() * 300;
    this.xHigh = 1500 + Math.random() * 3000;
    this.threshold = -30 + Math.random() * 20;
    this.ratio = 2 + Math.random() * 8;
    this.low = Math.random();
    this.mid = Math.random();
    this.high = Math.random();
    this.attack = 2 + Math.random() * 30;
    this.release = 50 + Math.random() * 300;
    this.makeup = Math.random() * 8;
  }

  setParams(p: Record<string, number>): void {
    if (p.xLow !== undefined) this.xLow = clamp(p.xLow, 80, 500);
    if (p.xHigh !== undefined) this.xHigh = clamp(p.xHigh, 1000, 8000);
    if (p.threshold !== undefined) this.threshold = clamp(p.threshold, -60, 0);
    if (p.ratio !== undefined) this.ratio = clamp(p.ratio, 1, 20);
    if (p.low !== undefined) this.low = clamp(p.low, 0, 1);
    if (p.mid !== undefined) this.mid = clamp(p.mid, 0, 1);
    if (p.high !== undefined) this.high = clamp(p.high, 0, 1);
    if (p.attack !== undefined) this.attack = clamp(p.attack, 1, 100);
    if (p.release !== undefined) this.release = clamp(p.release, 10, 1000);
    if (p.makeup !== undefined) this.makeup = clamp(p.makeup, 0, 12);
  }

  getParams(): Record<string, number> {
    return {
      xLow: this.xLow, xHigh: this.xHigh, threshold: this.threshold, ratio: this.ratio,
      low: this.low, mid: this.mid, high: this.high,
      attack: this.attack, release: this.release, makeup: this.makeup,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const aA = 1 - Math.exp((-2 * Math.PI * this.xLow) / sr);
    const aB = 1 - Math.exp((-2 * Math.PI * Math.min(this.xHigh, sr * 0.45)) / sr);
    const att = Math.exp(-1 / ((this.attack / 1000) * sr));
    const rel = Math.exp(-1 / ((this.release / 1000) * sr));
    const thresh = this.threshold;
    const comp = 1 - 1 / this.ratio;
    const amounts = [this.low, this.mid, this.high];
    const makeup = Math.pow(10, this.makeup / 20);
    const env = this.env;
    const band = [0, 0, 0];
    let a1 = this.a1, a2 = this.a2, b1 = this.b1, b2 = this.b2;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      a1 += aA * (x - a1);
      a2 += aA * (a1 - a2);
      b1 += aB * (x - b1);
      b2 += aB * (b1 - b2);

      band[0] = a2;
      band[1] = b2 - a2;
      band[2] = x - b2;

      let out = 0;
      for (let k = 0; k < 3; k++) {
        const a = Math.abs(band[k]);
        env[k] = a > env[k] ? att * env[k] + (1 - att) * a : rel * env[k] + (1 - rel) * a;
        const db = 20 * Math.log10(Math.max(1e-6, env[k]));
        const reduction = db > thresh ? (thresh - db) * comp * amounts[k] : 0;
        out += band[k] * Math.pow(10, reduction / 20);
      }
      samples[i] = out * makeup;
    }

    this.a1 = a1; this.a2 = a2; this.b1 = b1; this.b2 = b2;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'multiband',
    name: 'Multiband Compressor',
    category: 'dynamics',
    description: 'Three-band compressor with adjustable crossovers and per-band amount.',
    defaultSampleRate: 44100,
    params: [
      { name: 'xLow', label: 'Low X-over (Hz)', type: 'float', min: 80, max: 500, step: 10, value: 200, tooltip: 'Low/mid split' },
      { name: 'xHigh', label: 'High X-over (Hz)', type: 'float', min: 1000, max: 8000, step: 50, value: 2500, tooltip: 'Mid/high split' },
      { name: 'threshold', label: 'Threshold (dB)', type: 'float', min: -60, max: 0, step: 1, value: -20, tooltip: 'Compression threshold per band' },
      { name: 'ratio', label: 'Ratio', type: 'float', min: 1, max: 20, step: 0.5, value: 3, tooltip: 'Compression ratio' },
      { name: 'low', label: 'Low Amount', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'Compression applied to the low band' },
      { name: 'mid', label: 'Mid Amount', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'Compression applied to the mid band' },
      { name: 'high', label: 'High Amount', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'Compression applied to the high band' },
      { name: 'attack', label: 'Attack (ms)', type: 'float', min: 1, max: 100, step: 1, value: 10, tooltip: 'Envelope attack' },
      { name: 'release', label: 'Release (ms)', type: 'float', min: 10, max: 1000, step: 10, value: 120, tooltip: 'Envelope release' },
      { name: 'makeup', label: 'Makeup (dB)', type: 'float', min: 0, max: 12, step: 0.5, value: 3, tooltip: 'Output gain after compression' },
    ],
  },
  create: (sr) => new MultibandCompFilter(sr),
};
