import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 1. Studio Dynamic Compressor / Peak Limiter
// In audio: smooth dynamic leveling, punch, and clipping prevention.
// In video: adaptive contrast compression, lifting shadow details, preventing blown highlights.
export class CompressorFilter extends BaseDspFilter {
  threshold = -18.0; // dB (-60 to 0)
  ratio = 4.0;       // 1 to 20
  attack = 10.0;     // ms (0.1 to 100)
  release = 100.0;   // ms (10 to 1000)
  makeupGain = 3.0;  // dB (0 to 24)

  private envelope = 0.0;
  private attackCoeff = 0.0;
  private releaseCoeff = 0.0;
  private linearMakeup = 1.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    const fs = this.sampleRate;
    // Time constants for one-pole smoothing: coeff = exp(-1 / (time_ms * 0.001 * fs))
    this.attackCoeff = Math.exp(-1000.0 / (Math.max(0.1, this.attack) * fs));
    this.releaseCoeff = Math.exp(-1000.0 / (Math.max(1.0, this.release) * fs));
    this.linearMakeup = Math.pow(10.0, this.makeupGain / 20.0);
    this.envelope = 0.0;
  }

  randomize(): void {
    this.threshold = -40 + Math.random() * 35;
    this.ratio = 2 + Math.random() * 10;
    this.attack = 1 + Math.random() * 40;
    this.release = 20 + Math.random() * 300;
    this.makeupGain = Math.random() * 12;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.threshold !== undefined) this.threshold = clamp(p.threshold, -60, 0);
    if (p.ratio !== undefined) this.ratio = clamp(p.ratio, 1, 20);
    if (p.attack !== undefined) this.attack = clamp(p.attack, 0.1, 100);
    if (p.release !== undefined) this.release = clamp(p.release, 10, 1000);
    if (p.makeupGain !== undefined) this.makeupGain = clamp(p.makeupGain, 0, 24);
    const envelope = this.envelope;
    this.init();
    this.envelope = envelope;
  }

  getParams(): Record<string, number> {
    return {
      threshold: this.threshold,
      ratio: this.ratio,
      attack: this.attack,
      release: this.release,
      makeupGain: this.makeupGain,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    let env = this.envelope;
    const att = this.attackCoeff;
    const rel = this.releaseCoeff;
    const thresh = this.threshold;
    const slope = 1.0 - 1.0 / this.ratio;
    const makeup = this.linearMakeup;
    const threshLin = Math.pow(10.0, thresh / 20.0);

    for (let i = 0; i < len; i++) {
      const inSample = samples[i];
      const absSample = Math.abs(inSample);

      // Smooth peak detector
      if (absSample > env) {
        env = att * env + (1.0 - att) * absSample;
      } else {
        env = rel * env + (1.0 - rel) * absSample;
      }

      // Compute compression gain reduction (mathematically eliminates Math.log10)
      let gain = makeup;
      if (env > threshLin) {
        gain = Math.pow(threshLin / env, slope) * makeup;
      }

      const out = inSample * gain;

      // Soft clamp to [-1, 1]
      samples[i] = out < -1.0 ? -1.0 : out > 1.0 ? 1.0 : out;
    }

    this.envelope = env;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'compressor',
    name: 'Studio Compressor',
    category: 'dynamics',
    description: 'Dynamic range compressor and peak limiter with auto-exposure tone mapping.',
    defaultSampleRate: 44100,
    params: [
      { name: 'threshold', label: 'Thresh (dB)', type: 'float', min: -60, max: 0, step: 1, value: -18, tooltip: 'Compression onset threshold in dB' },
      { name: 'ratio', label: 'Ratio (:1)', type: 'float', min: 1, max: 20, step: 0.5, value: 4, tooltip: 'Gain reduction ratio above threshold' },
      { name: 'attack', label: 'Attack (ms)', type: 'float', min: 0.1, max: 100, step: 0.5, value: 10, tooltip: 'Gain reduction reaction speed' },
      { name: 'release', label: 'Release (ms)', type: 'float', min: 10, max: 1000, step: 10, value: 100, tooltip: 'Gain recovery recovery speed' },
      { name: 'makeupGain', label: 'Gain (dB)', type: 'float', min: 0, max: 24, step: 0.5, value: 3, tooltip: 'Post-compression makeup output gain' },
    ],
  },
  create: (sr) => new CompressorFilter(sr),
};
