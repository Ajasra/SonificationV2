import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// 2. Downward Noise Gate / Squelch
// In audio: silences low-level room noise and hum below threshold.
// In video: deepens dark shadows to pure pitch black, isolating bright high-contrast elements.
export class NoiseGateFilter extends BaseDspFilter {
  threshold = -36.0; // dB (-80 to 0)
  range = -40.0;     // dB attenuation depth (-80 to 0)
  attack = 5.0;      // ms (0.1 to 50)
  release = 100.0;   // ms (10 to 500)

  private envelope = 0.0;
  private currentGain = 1.0;
  private attackCoeff = 0.0;
  private releaseCoeff = 0.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    const fs = this.sampleRate;
    this.attackCoeff = Math.exp(-1000.0 / (Math.max(0.1, this.attack) * fs));
    this.releaseCoeff = Math.exp(-1000.0 / (Math.max(1.0, this.release) * fs));
    this.envelope = 0.0;
    this.currentGain = 1.0;
  }

  randomize(): void {
    this.threshold = -60 + Math.random() * 40;
    this.range = -60 + Math.random() * 30;
    this.attack = 1 + Math.random() * 20;
    this.release = 30 + Math.random() * 200;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.threshold !== undefined) this.threshold = clamp(p.threshold, -80, 0);
    if (p.range !== undefined) this.range = clamp(p.range, -80, 0);
    if (p.attack !== undefined) this.attack = clamp(p.attack, 0.1, 50);
    if (p.release !== undefined) this.release = clamp(p.release, 10, 500);
    const envelope = this.envelope;
    const gain = this.currentGain;
    this.init();
    this.envelope = envelope;
    this.currentGain = gain;
  }

  getParams(): Record<string, number> {
    return {
      threshold: this.threshold,
      range: this.range,
      attack: this.attack,
      release: this.release,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    let env = this.envelope;
    let gain = this.currentGain;
    const att = this.attackCoeff;
    const rel = this.releaseCoeff;
    const thresh = this.threshold;
    const minGain = Math.pow(10.0, this.range / 20.0);

    for (let i = 0; i < len; i++) {
      const inSample = samples[i];
      const absSample = Math.abs(inSample);

      if (absSample > env) {
        env = att * env + (1.0 - att) * absSample;
      } else {
        env = rel * env + (1.0 - rel) * absSample;
      }

      const envDb = 20.0 * Math.log10(Math.max(1e-5, env));
      const targetGain = envDb >= thresh ? 1.0 : minGain;

      // Smooth gain transition
      if (targetGain > gain) {
        gain = att * gain + (1.0 - att) * targetGain;
      } else {
        gain = rel * gain + (1.0 - rel) * targetGain;
      }

      samples[i] = inSample * gain;
    }

    this.envelope = env;
    this.currentGain = gain;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'noisegate',
    name: 'Noise Gate',
    category: 'dynamics',
    description: 'Downward noise gate squelch for high-contrast shadow isolation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'threshold', label: 'Thresh (dB)', type: 'float', min: -80, max: 0, step: 1, value: -36, tooltip: 'Gate opening threshold level in dB' },
      { name: 'range', label: 'Range (dB)', type: 'float', min: -80, max: 0, step: 1, value: -40, tooltip: 'Maximum attenuation applied when gate is shut' },
      { name: 'attack', label: 'Attack (ms)', type: 'float', min: 0.1, max: 50, step: 0.5, value: 5, tooltip: 'Speed gate opens once signal exceeds threshold' },
      { name: 'release', label: 'Release (ms)', type: 'float', min: 10, max: 500, step: 10, value: 100, tooltip: 'Speed gate closes once signal drops below threshold' },
    ],
  },
  create: (sr) => new NoiseGateFilter(sr),
};
