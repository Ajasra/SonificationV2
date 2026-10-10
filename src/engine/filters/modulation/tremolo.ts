import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 3. Tremolo & Strobe
// In audio: rhythmic volume pulsating, shutter helicopter gating.
// In video: periodic horizontal exposure strobe bars and zebra scanlines.
export class TremoloFilter extends BaseDspFilter {
  rate = 4.0;        // Hz (0.5 to 25)
  depth = 0.7;       // 0 to 1
  shape = 0;         // 0 = Sine, 1 = Triangle, 2 = Square

  private lfoPhase = 0.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.lfoPhase = 0.0;
  }

  randomize(): void {
    this.rate = 1.0 + Math.random() * 15.0;
    this.depth = 0.4 + Math.random() * 0.6;
    this.shape = Math.floor(Math.random() * 3);
  }

  setParams(p: Record<string, number>): void {
    if (p.rate !== undefined) this.rate = clamp(p.rate, 0.5, 25);
    if (p.depth !== undefined) this.depth = clamp(p.depth, 0, 1);
    if (p.shape !== undefined) this.shape = clamp(Math.round(p.shape), 0, 2);
  }

  getParams(): Record<string, number> {
    return {
      rate: this.rate,
      depth: this.depth,
      shape: this.shape,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const fs = this.sampleRate;
    const lfoInc = (2.0 * Math.PI * this.rate) / fs;
    const d = this.depth;
    const shp = this.shape;
    let lfo = this.lfoPhase;

    for (let i = 0; i < len; i++) {
      let lfoVal = 0.0; // [0, 1]
      if (shp === 0) {
        // Sine
        lfoVal = 0.5 * (1.0 + Math.sin(lfo));
      } else if (shp === 1) {
        // Triangle
        const norm = (lfo / (2.0 * Math.PI)) % 1.0;
        lfoVal = norm < 0.5 ? 2.0 * norm : 2.0 * (1.0 - norm);
      } else {
        // Square
        lfoVal = Math.sin(lfo) >= 0 ? 1.0 : 0.0;
      }

      lfo += lfoInc;
      if (lfo >= 2.0 * Math.PI) lfo -= 2.0 * Math.PI;

      const gain = 1.0 - d * (1.0 - lfoVal);
      samples[i] = samples[i] * gain;
    }

    this.lfoPhase = lfo;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'tremolo',
    name: 'Tremolo & Strobe',
    category: 'modulation',
    description: 'LFO amplitude modulation producing rhythmic pulses and zebra strobe bands.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (Hz)', type: 'float', min: 0.5, max: 25, step: 0.25, value: 4.0, tooltip: 'Tremolo pulse rate in Hz' },
      { name: 'depth', label: 'Depth', type: 'float', min: 0, max: 1, step: 0.05, value: 0.7, tooltip: 'Volume modulation depth (strobe contrast)' },
      { name: 'shape', label: 'Waveform', type: 'int', min: 0, max: 2, step: 1, value: 0, tooltip: 'LFO shape: 0=Sine, 1=Triangle, 2=Square' },
    ],
  },
  create: (sr) => new TremoloFilter(sr),
};
