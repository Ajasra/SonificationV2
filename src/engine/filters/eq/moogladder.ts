import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

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

      const x0 = inSample - res * s4 * scale;
      const u = x0 < -3.0 ? -1.0 : x0 > 3.0 ? 1.0 : (x0 * (27.0 + x0 * x0)) / (27.0 + 9.0 * x0 * x0);

      const tu = u < -3.0 ? -1.0 : u > 3.0 ? 1.0 : (u * (27.0 + u * u)) / (27.0 + 9.0 * u * u);
      const ts1 = s1 < -3.0 ? -1.0 : s1 > 3.0 ? 1.0 : (s1 * (27.0 + s1 * s1)) / (27.0 + 9.0 * s1 * s1);
      s1 += g * (tu - ts1);

      const n_ts1 = s1 < -3.0 ? -1.0 : s1 > 3.0 ? 1.0 : (s1 * (27.0 + s1 * s1)) / (27.0 + 9.0 * s1 * s1);
      const ts2 = s2 < -3.0 ? -1.0 : s2 > 3.0 ? 1.0 : (s2 * (27.0 + s2 * s2)) / (27.0 + 9.0 * s2 * s2);
      s2 += g * (n_ts1 - ts2);

      const n_ts2 = s2 < -3.0 ? -1.0 : s2 > 3.0 ? 1.0 : (s2 * (27.0 + s2 * s2)) / (27.0 + 9.0 * s2 * s2);
      const ts3 = s3 < -3.0 ? -1.0 : s3 > 3.0 ? 1.0 : (s3 * (27.0 + s3 * s3)) / (27.0 + 9.0 * s3 * s3);
      s3 += g * (n_ts2 - ts3);

      const n_ts3 = s3 < -3.0 ? -1.0 : s3 > 3.0 ? 1.0 : (s3 * (27.0 + s3 * s3)) / (27.0 + 9.0 * s3 * s3);
      const ts4 = s4 < -3.0 ? -1.0 : s4 > 3.0 ? 1.0 : (s4 * (27.0 + s4 * s4)) / (27.0 + 9.0 * s4 * s4);
      s4 += g * (n_ts3 - ts4);

      // Prevent NaN/Inf
      const out = s4 !== s4 ? 0 : s4;
      samples[i] = out < -1.0 ? -1.0 : out > 1.0 ? 1.0 : out;
    }

    this.y1 = s1; this.y2 = s2; this.y3 = s3; this.y4 = s4;
    this.oldx = ox; this.oldy1 = oy1; this.oldy2 = oy2; this.oldy3 = oy3;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'moogladder',
    name: 'Moog 24dB Ladder',
    category: 'eq',
    description: '4-pole resonant transistor ladder filter with nonlinear tanh feedback.',
    defaultSampleRate: 44100,
    params: [
      { name: 'cutoff', label: 'Cutoff (Hz)', type: 'float', min: 20, max: 18000, step: 50, value: 1200, tooltip: '4-pole 24dB/octave cutoff frequency' },
      { name: 'resonance', label: 'Resonance', type: 'float', min: 0, max: 4, step: 0.1, value: 2.2, tooltip: 'Transistor ladder feedback peak (self-oscillates above 3.5)' },
      { name: 'drive', label: 'Drive', type: 'float', min: 1, max: 5, step: 0.1, value: 1.5, tooltip: 'Input saturation drive into the ladder core' },
    ],
  },
  create: (sr) => new MoogLadderFilter(sr),
};
