// Dynamics Processors: Compressor & Noise Gate
// Zero-allocation sample block DSP for audio leveling and visual dynamic tone mapping
import { BaseDspFilter } from './base.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

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

    for (let i = 0; i < len; i++) {
      const inSample = samples[i];
      const absSample = Math.abs(inSample);

      // Smooth peak detector
      if (absSample > env) {
        env = att * env + (1.0 - att) * absSample;
      } else {
        env = rel * env + (1.0 - rel) * absSample;
      }

      // Convert envelope to dB (prevent log(0))
      const envDb = 20.0 * Math.log10(Math.max(1e-5, env));

      // Compute compression gain reduction
      let gainDb = 0.0;
      if (envDb > thresh) {
        gainDb = -slope * (envDb - thresh);
      }

      const gain = Math.pow(10.0, gainDb / 20.0) * makeup;
      const out = inSample * gain;

      // Soft clamp to [-1, 1]
      samples[i] = out < -1.0 ? -1.0 : out > 1.0 ? 1.0 : out;
    }

    this.envelope = env;
  }
}

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
