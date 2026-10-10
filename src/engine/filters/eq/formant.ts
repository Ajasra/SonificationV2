import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';
import { Biquad } from '../../biquad.ts';

// 3. Formant / Vowel Resonator Filter
// In audio: models the acoustic resonances of the human vocal tract (/A/, /E/, /I/, /O/, /U/).
// In video: vocal band-pass filtration that generates speech-like spectral patterns across raster channels.
export class FormantFilter extends BaseDspFilter {
  vowel = 0.0;       // 0=/A/, 1=/E/, 2=/I/, 3=/O/, 4=/U/ (continuous morph)
  resonance = 8.0;   // 1 to 20 (peak sharpness)
  mix = 0.9;         // 0 to 1

  private bp1 = new Biquad();
  private bp2 = new Biquad();
  private bp3 = new Biquad();

  // Formant frequencies [F1, F2, F3] for male vowels
  private static readonly VOWELS = [
    [800, 1200, 2500], // /A/ (father)
    [500, 1800, 2500], // /E/ (bed)
    [270, 2300, 3000], // /I/ (see)
    [500, 850, 2400],  // /O/ (go)
    [300, 870, 2250],  // /U/ (boot)
  ];

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.bp1.reset();
    this.bp2.reset();
    this.bp3.reset();
    this.updateFormantFrequencies();
  }

  private updateFormantFrequencies(): void {
    const v = clamp(this.vowel, 0, 4);
    const idx = Math.floor(v);
    const frac = v - idx;
    const v1 = FormantFilter.VOWELS[Math.min(4, idx)];
    const v2 = FormantFilter.VOWELS[Math.min(4, idx + 1)];

    const f1 = v1[0] + frac * (v2[0] - v1[0]);
    const f2 = v1[1] + frac * (v2[1] - v1[1]);
    const f3 = v1[2] + frac * (v2[2] - v1[2]);

    const bw = 1.0 / clamp(this.resonance, 0.5, 20.0);
    this.bp1.bpSetParams(f1, bw, this.sampleRate);
    this.bp2.bpSetParams(f2, bw, this.sampleRate);
    this.bp3.bpSetParams(f3, bw, this.sampleRate);
  }

  randomize(): void {
    this.vowel = Math.random() * 4;
    this.resonance = 4 + Math.random() * 12;
    this.mix = 0.7 + Math.random() * 0.3;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.vowel !== undefined) this.vowel = clamp(p.vowel, 0, 4);
    if (p.resonance !== undefined) this.resonance = clamp(p.resonance, 1, 20);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
    this.updateFormantFrequencies();
  }

  getParams(): Record<string, number> {
    return {
      vowel: this.vowel,
      resonance: this.resonance,
      mix: this.mix,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const mix = this.mix;
    const dryGain = 1.0 - mix;

    // Run parallel resonators
    for (let i = 0; i < len; i++) {
      const s = samples[i];
      const y1 = this.bp1.run(s);
      const y2 = this.bp2.run(s);
      const y3 = this.bp3.run(s);
      const wet = (y1 + y2 * 0.7 + y3 * 0.4) * 1.5;
      const out = s * dryGain + wet * mix;
      samples[i] = out !== out ? 0 : out;
    }
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'formant',
    name: 'Formant Resonator',
    category: 'eq',
    description: 'Vocal tract acoustic resonator morphing across /A/, /E/, /I/, /O/, /U/.',
    defaultSampleRate: 44100,
    params: [
      { name: 'vowel', label: 'Vowel (A-E-I-O-U)', type: 'float', min: 0, max: 4, step: 0.1, value: 0.0, tooltip: 'Vowel formant position (0:A, 1:E, 2:I, 3:O, 4:U)' },
      { name: 'resonance', label: 'Formant Q', type: 'float', min: 1, max: 20, step: 0.5, value: 8.0, tooltip: 'Acoustic vocal tract resonance peak width' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.9, tooltip: 'Formant resonator mix amount' },
    ],
  },
  create: (sr) => new FormantFilter(sr),
};
