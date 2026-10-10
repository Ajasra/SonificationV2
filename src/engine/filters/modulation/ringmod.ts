import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 1. Ring Modulator
// In audio: non-harmonic sidebands, sci-fi Dalek robotic timbre, metallic clangorous bells.
// In video: dense moiré interference patterns and periodic horizontal chromatic lattices.
export class RingModFilter extends BaseDspFilter {
  freq = 440.0;      // Hz (10 to 4000)
  waveform = 0;      // 0 = Sine, 1 = Triangle, 2 = Square
  mix = 0.85;        // 0 to 1

  private phase = 0.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.phase = 0.0;
  }

  randomize(): void {
    this.freq = 40 + Math.random() * 1800;
    this.waveform = Math.floor(Math.random() * 3);
    this.mix = 0.6 + Math.random() * 0.4;
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = clamp(p.freq, 10, 4000);
    if (p.waveform !== undefined) this.waveform = clamp(Math.round(p.waveform), 0, 2);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return {
      freq: this.freq,
      waveform: this.waveform,
      mix: this.mix,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const fs = this.sampleRate;
    const phaseInc = (2.0 * Math.PI * this.freq) / fs;
    const mix = this.mix;
    const dry = 1.0 - mix;
    const wf = this.waveform;
    let ph = this.phase;

    for (let i = 0; i < len; i++) {
      let carrier = 0.0;
      if (wf === 0) {
        // Sine
        carrier = Math.sin(ph);
      } else if (wf === 1) {
        // Triangle
        const norm = (ph / (2.0 * Math.PI)) % 1.0;
        carrier = norm < 0.5 ? 4.0 * norm - 1.0 : 3.0 - 4.0 * norm;
      } else {
        // Square
        carrier = Math.sin(ph) >= 0 ? 1.0 : -1.0;
      }

      ph += phaseInc;
      if (ph >= 2.0 * Math.PI) ph -= 2.0 * Math.PI;

      const mod = samples[i] * carrier;
      samples[i] = samples[i] * dry + mod * mix;
    }

    this.phase = ph;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'ringmod',
    name: 'Ring Modulator',
    category: 'modulation',
    description: 'Carrier multiplication creating metallic sidebands and moiré interference.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Freq (Hz)', type: 'float', min: 10, max: 4000, step: 10, value: 440, tooltip: 'Carrier oscillator frequency in Hz' },
      { name: 'waveform', label: 'Waveform', type: 'int', min: 0, max: 2, step: 1, value: 0, tooltip: 'Carrier shape: 0=Sine, 1=Triangle, 2=Square' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.85, tooltip: 'Balance between unaffected and modulated carrier' },
    ],
  },
  create: (sr) => new RingModFilter(sr),
};
