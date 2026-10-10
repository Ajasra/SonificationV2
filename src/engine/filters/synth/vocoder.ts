import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

const MAX_BANDS = 16;

// Vocoder-lite: input envelope per band modulates a matching band of a noise or saw carrier.
export class VocoderFilter extends BaseDspFilter {
  bands = 8;
  q = 5;
  carrier = 1;     // 0 = noise, 1 = saw
  freq = 110;
  mix = 1.0;

  private mLow = new Float64Array(MAX_BANDS);
  private mBand = new Float64Array(MAX_BANDS);
  private cLow = new Float64Array(MAX_BANDS);
  private cBand = new Float64Array(MAX_BANDS);
  private env = new Float64Array(MAX_BANDS);
  private phase = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.mLow.fill(0);
    this.mBand.fill(0);
    this.cLow.fill(0);
    this.cBand.fill(0);
    this.env.fill(0);
    this.phase = 0;
  }

  randomize(): void {
    this.bands = 4 + Math.floor(Math.random() * 13);
    this.q = 2 + Math.random() * 8;
    this.carrier = Math.round(Math.random());
    this.freq = 55 * Math.pow(2, Math.random() * 4);
    this.mix = 0.8 + Math.random() * 0.2;
  }

  setParams(p: Record<string, number>): void {
    if (p.bands !== undefined) this.bands = clamp(Math.round(p.bands), 4, MAX_BANDS);
    if (p.q !== undefined) this.q = clamp(p.q, 1, 12);
    if (p.carrier !== undefined) this.carrier = clamp(Math.round(p.carrier), 0, 1);
    if (p.freq !== undefined) this.freq = clamp(p.freq, 55, 440);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return { bands: this.bands, q: this.q, carrier: this.carrier, freq: this.freq, mix: this.mix };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const nb = this.bands;
    const damp = 1 / this.q;
    const coef = new Float64Array(nb);
    const lo = 150;
    const hi = Math.min(6000, sr * 0.4);
    for (let b = 0; b < nb; b++) {
      const fc = lo * Math.pow(hi / lo, b / (nb - 1));
      coef[b] = Math.min(1.2, 2 * Math.sin((Math.PI * fc) / sr));
    }
    const att = Math.exp(-1 / (0.003 * sr));
    const rel = Math.exp(-1 / (0.03 * sr));
    const inc = this.freq / sr;
    const useSaw = this.carrier === 1;
    const mix = this.mix;
    const dry = 1 - mix;
    let ph = this.phase;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      let car: number;
      if (useSaw) {
        car = 2 * ph - 1;
        ph += inc;
        if (ph >= 1) ph -= 1;
      } else {
        car = Math.random() * 2 - 1;
      }

      let sum = 0;
      for (let b = 0; b < nb; b++) {
        const f = coef[b];
        // modulator band
        this.mLow[b] += f * this.mBand[b];
        const mHigh = x - this.mLow[b] - damp * this.mBand[b];
        this.mBand[b] += f * mHigh;
        const a = Math.abs(this.mBand[b]);
        const e = this.env[b];
        this.env[b] = a > e ? att * e + (1 - att) * a : rel * e + (1 - rel) * a;
        // carrier band
        this.cLow[b] += f * this.cBand[b];
        const cHigh = car - this.cLow[b] - damp * this.cBand[b];
        this.cBand[b] += f * cHigh;
        sum += this.cBand[b] * this.env[b];
      }

      const out = Math.tanh(sum * (6 / Math.sqrt(nb)));
      samples[i] = x * dry + out * mix;
    }

    this.phase = ph;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'vocoder',
    name: 'Vocoder Lite',
    category: 'synth',
    description: 'Band-split vocoder: the input envelope shapes a noise or saw carrier.',
    defaultSampleRate: 44100,
    params: [
      { name: 'bands', label: 'Bands', type: 'int', min: 4, max: 16, step: 1, value: 8, tooltip: 'Number of analysis/synthesis bands' },
      { name: 'q', label: 'Band Q', type: 'float', min: 1, max: 12, step: 0.5, value: 5, tooltip: 'Band sharpness' },
      { name: 'carrier', label: 'Carrier', type: 'int', min: 0, max: 1, step: 1, value: 1, tooltip: '0=Noise, 1=Saw' },
      { name: 'freq', label: 'Pitch (Hz)', type: 'float', min: 55, max: 440, step: 1, value: 110, tooltip: 'Saw carrier pitch' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'Dry/wet balance' },
    ],
  },
  create: (sr) => new VocoderFilter(sr),
};
