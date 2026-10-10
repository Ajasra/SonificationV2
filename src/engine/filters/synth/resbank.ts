import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

const VOICES = 4;

// Karplus Resonator Bank: four tuned damped feedback-delay strings excited by the input.
export class ResonatorBankFilter extends BaseDspFilter {
  root = 110;
  spread = 7;      // semitones between successive voices
  decay = 0.95;    // feedback
  damping = 0.3;
  mix = 0.7;

  private bufs: Float32Array[] = [];
  private pos = 0;
  private lp = new Float32Array(VOICES);

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    const size = Math.ceil(this.sampleRate / 20) + 4;
    this.bufs = Array.from({ length: VOICES }, () => new Float32Array(size));
    this.pos = 0;
    this.lp.fill(0);
  }

  randomize(): void {
    this.root = 55 * Math.pow(2, Math.random() * 3);
    this.spread = Math.round(Math.random() * 12);
    this.decay = 0.85 + Math.random() * 0.14;
    this.damping = Math.random() * 0.7;
    this.mix = 0.5 + Math.random() * 0.5;
  }

  setParams(p: Record<string, number>): void {
    if (p.root !== undefined) this.root = clamp(p.root, 40, 800);
    if (p.spread !== undefined) this.spread = clamp(p.spread, 0, 12);
    if (p.decay !== undefined) this.decay = clamp(p.decay, 0.5, 0.999);
    if (p.damping !== undefined) this.damping = clamp(p.damping, 0, 0.95);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return { root: this.root, spread: this.spread, decay: this.decay, damping: this.damping, mix: this.mix };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const size = this.bufs[0].length;
    const delays: number[] = [];
    for (let v = 0; v < VOICES; v++) {
      const f = this.root * Math.pow(2, (v * this.spread) / 12);
      delays.push(clamp(this.sampleRate / Math.min(f, this.sampleRate * 0.45), 2, size - 3));
    }
    const fb = this.decay;
    const damp = this.damping;
    const mix = this.mix;
    const dry = 1 - mix;
    let pos = this.pos;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      let sum = 0;
      for (let v = 0; v < VOICES; v++) {
        const buf = this.bufs[v];
        let rp = pos - delays[v];
        if (rp < 0) rp += size;
        const i0 = Math.floor(rp);
        const fr = rp - i0;
        const y = buf[i0] + (buf[(i0 + 1) % size] - buf[i0]) * fr;
        const lp = (1 - damp) * y + damp * this.lp[v];
        this.lp[v] = lp;
        buf[pos] = Math.tanh(x * 0.5 + fb * lp);
        sum += y;
      }
      if (++pos >= size) pos = 0;
      samples[i] = x * dry + sum * 0.5 * mix;
    }

    this.pos = pos;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'resbank',
    name: 'Resonator Bank',
    category: 'synth',
    description: 'Four tuned Karplus-style strings ringing out from the input, spread as a chord.',
    defaultSampleRate: 44100,
    params: [
      { name: 'root', label: 'Root (Hz)', type: 'float', min: 40, max: 800, step: 1, value: 110, tooltip: 'Pitch of the lowest string' },
      { name: 'spread', label: 'Spread (st)', type: 'float', min: 0, max: 12, step: 1, value: 7, tooltip: 'Semitone interval between successive strings' },
      { name: 'decay', label: 'Decay', type: 'float', min: 0.5, max: 0.999, step: 0.001, value: 0.95, tooltip: 'String feedback; higher rings longer' },
      { name: 'damping', label: 'Damping', type: 'float', min: 0, max: 0.95, step: 0.05, value: 0.3, tooltip: 'High-frequency loss per round trip' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.7, tooltip: 'Dry/wet balance' },
    ],
  },
  create: (sr) => new ResonatorBankFilter(sr),
};
