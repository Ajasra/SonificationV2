// Spectral & Analog Classic Filters: Moog Ladder, State-Variable (SVF), Formant / Vowel
import { BaseDspFilter } from './base.ts';
import { Biquad } from '../biquad.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// Fast rational approximation of tanh for inner audio saturation loops
function fastTanh(x: number): number {
  if (x < -3.0) return -1.0;
  if (x > 3.0) return 1.0;
  const x2 = x * x;
  return (x * (27.0 + x2)) / (27.0 + 9.0 * x2);
}

// 1. Moog 24dB/oct 4-Pole Transistor Ladder Filter (Stilson-Smith / Houvilainen model)
// In audio: legendary fat analog warmth, liquid resonant squelch, non-linear tanh overdrive.
// In video: deep analog chromatic bleeding with resonant edge halo glows.
export class MoogLadderFilter extends BaseDspFilter {
  cutoff = 1200.0;   // Hz (20 to 18000)
  resonance = 2.2;   // 0 to 4 (self-oscillates above ~3.8)
  drive = 1.5;       // 1 to 5

  // 4 cascaded one-pole state variables
  private y1 = 0;
  private y2 = 0;
  private y3 = 0;
  private y4 = 0;
  private oldx = 0;
  private oldy1 = 0;
  private oldy2 = 0;
  private oldy3 = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.y1 = 0;
    this.y2 = 0;
    this.y3 = 0;
    this.y4 = 0;
    this.oldx = 0;
    this.oldy1 = 0;
    this.oldy2 = 0;
    this.oldy3 = 0;
  }

  randomize(): void {
    this.cutoff = 80 + Math.random() * 8000;
    this.resonance = Math.random() * 3.8;
    this.drive = 1 + Math.random() * 3;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.cutoff !== undefined) this.cutoff = clamp(p.cutoff, 20, 18000);
    if (p.resonance !== undefined) this.resonance = clamp(p.resonance, 0, 4);
    if (p.drive !== undefined) this.drive = clamp(p.drive, 1, 5);
  }

  getParams(): Record<string, number> {
    return {
      cutoff: this.cutoff,
      resonance: this.resonance,
      drive: this.drive,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const fs = this.sampleRate;

    // Normalized frequency tuning with thermal voltage compensation
    const fc = clamp(this.cutoff, 20, fs * 0.45);
    const f = (fc * 2.0) / fs;
    // Frequency warp parameter
    const k = 3.6 * f - 1.6 * f * f - 1.0;
    const p = (k + 1.0) * 0.5;
    const scale = Math.exp((1.0 - p) * 1.386249);
    const g = 1.0 - Math.exp(-p * 2.0); // tuning coefficient

    const res = this.resonance;
    const drv = this.drive;

    let s1 = this.y1, s2 = this.y2, s3 = this.y3, s4 = this.y4;
    let ox = this.oldx, oy1 = this.oldy1, oy2 = this.oldy2, oy3 = this.oldy3;

    for (let i = 0; i < len; i++) {
      const inSample = samples[i] * drv;

      // 4-pole non-linear ladder loop with tanh feedback saturation
      const u = fastTanh(inSample - res * s4 * scale);

      s1 = s1 + g * (fastTanh(u) - fastTanh(s1));
      s2 = s2 + g * (fastTanh(s1) - fastTanh(s2));
      s3 = s3 + g * (fastTanh(s2) - fastTanh(s3));
      s4 = s4 + g * (fastTanh(s3) - fastTanh(s4));

      // Prevent NaN/Inf
      const out = s4 !== s4 ? 0 : s4;
      samples[i] = out < -1.0 ? -1.0 : out > 1.0 ? 1.0 : out;
    }

    this.y1 = s1; this.y2 = s2; this.y3 = s3; this.y4 = s4;
    this.oldx = ox; this.oldy1 = oy1; this.oldy2 = oy2; this.oldy3 = oy3;
  }
}

// 2. State-Variable Multi-Mode Filter (Andrew Simper / Chamberlin SVF)
// In audio: 12dB/oct multi-mode filter with smooth continuous morphing between LP -> BP -> HP -> Notch.
// In video: morphing from color blur/diffusion (LP) to edge detection/sharpening (HP).
export class SvfFilter extends BaseDspFilter {
  cutoff = 1500.0;   // Hz (20 to 18000)
  res = 2.0;         // Q factor (0.5 to 10)
  mode = 0;          // 0 = Lowpass, 1 = Bandpass, 2 = Highpass, 3 = Notch (continuous)

  private ic1eq = 0.0;
  private ic2eq = 0.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.ic1eq = 0.0;
    this.ic2eq = 0.0;
  }

  randomize(): void {
    this.cutoff = 100 + Math.random() * 8000;
    this.res = 0.7 + Math.random() * 6;
    this.mode = Math.random() * 3;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.cutoff !== undefined) this.cutoff = clamp(p.cutoff, 20, 18000);
    if (p.res !== undefined) this.res = clamp(p.res, 0.5, 10);
    if (p.mode !== undefined) this.mode = clamp(p.mode, 0, 3);
  }

  getParams(): Record<string, number> {
    return {
      cutoff: this.cutoff,
      res: this.res,
      mode: this.mode,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const fs = this.sampleRate;
    const fc = clamp(this.cutoff, 20, fs * 0.48);
    const g = Math.tan((Math.PI * fc) / fs);
    const k = 1.0 / this.res;
    const a1 = 1.0 / (1.0 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;

    const m = this.mode;
    let s1 = this.ic1eq;
    let s2 = this.ic2eq;

    for (let i = 0; i < len; i++) {
      const v0 = samples[i];
      const v3 = v0 - s2;
      const v1 = a1 * s1 + a2 * v3;
      const v2 = s2 + a2 * s1 + a3 * v3;
      s1 = 2.0 * v1 - s1;
      s2 = 2.0 * v2 - s2;

      const lp = v2;
      const bp = v1;
      const hp = v0 - k * v1 - v2;
      const notch = hp + lp;

      // Morph between LP(0) -> BP(1) -> HP(2) -> Notch(3)
      let out = 0;
      if (m <= 1.0) {
        out = lp * (1.0 - m) + bp * m;
      } else if (m <= 2.0) {
        const t = m - 1.0;
        out = bp * (1.0 - t) + hp * t;
      } else {
        const t = m - 2.0;
        out = hp * (1.0 - t) + notch * t;
      }

      samples[i] = out !== out ? 0 : out;
    }

    this.ic1eq = s1;
    this.ic2eq = s2;
  }
}

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
