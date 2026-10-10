import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';

// 13. TapAutopan: Stereo panning modulation
export class TapAutopanFilter extends BaseDspFilter {
  freq = 5.0;
  depth = 10.0;
  gain = 1.0;
  phaseStep = 10.0;

  private phase = 0.0;
  private cosTable = new Float32Array(1024);

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    for (let i = 0; i < 1024; i++) {
      this.cosTable[i] = Math.cos((i * Math.PI) / 512.0);
    }
    this.init();
  }

  init(): void {
    this.phase = 0.0;
  }

  randomize(): void {
    this.freq = Math.random() * 20;
    this.depth = Math.random() * 100;
    this.gain = -20 + Math.random() * 40;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = p.freq;
    if (p.depth !== undefined) this.depth = p.depth;
    if (p.gain !== undefined) this.gain = p.gain;
    if (p.phaseStep !== undefined) this.phaseStep = p.phaseStep;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      freq: this.freq,
      depth: this.depth,
      gain: this.gain,
      phaseStep: this.phaseStep,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const gLinear = this.gain > -90.0 ? Math.pow(10.0, this.gain * 0.05) : 0.0;
    const dNorm = this.depth / 100.0;
    const pStep = 1.0 / Math.max(1e-6, this.phaseStep);
    const cosTbl = this.cosTable;

    const phaseInc = (1024.0 * this.freq) / this.sampleRate + pStep;
    let ph = this.phase;

    const baseMod = gLinear * (1 - 0.5 * dNorm);
    const modScale = gLinear * (0.5 * dNorm);

    for (let i = 0; i < len; i += 2) {
      const idxL = (ph | 0) & 1023;
      const idxR = (idxL + 512) & 1023;

      const leftMod = baseMod + modScale * cosTbl[idxL];
      const rightMod = baseMod + modScale * cosTbl[idxR];

      samples[i] *= leftMod;
      if (i + 1 < len) {
        samples[i + 1] *= rightMod;
      }

      ph += phaseInc;
      if (ph >= 1024.0) ph -= 1024.0;
    }

    this.phase = ph;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'autopan',
    name: 'Auto Pan',
    category: 'modulation',
    description: 'Stereo panning LFO modulation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Rate (Hz)', type: 'float', min: 0.1, max: 20, step: 0.1, value: 5, tooltip: 'Stereo pan cycle speed' },
      { name: 'depth', label: 'Depth (%)', type: 'float', min: 0, max: 100, step: 1, value: 10, tooltip: 'Stereo field panning width' },
      { name: 'gain', label: 'Gain (dB)', type: 'float', min: -20, max: 20, step: 0.5, value: 1, tooltip: 'Output booster gain' },
    ],
  },
  create: (sr) => new TapAutopanFilter(sr),
};
