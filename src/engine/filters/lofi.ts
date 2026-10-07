// Digital Lo-Fi, Circuit-Bending & Wavefolding: Bitcrusher & West-Coast Wavefolder
import { BaseDspFilter } from './base.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// 1. Bitcrusher & Decimator (Sample-Rate Reducer)
// In audio: gritty chiptune crunch, harsh aliasing distortion, digital lo-fi quantization.
// In video: stepped posterization color banding and horizontal blocky scanline decimation.
export class BitcrusherFilter extends BaseDspFilter {
  bits = 6;          // 1 to 16
  downsample = 8;    // 1 to 64
  mix = 1.0;         // 0 to 1

  private heldSample = 0.0;
  private sampleCounter = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.heldSample = 0.0;
    this.sampleCounter = 0;
  }

  randomize(): void {
    this.bits = Math.floor(2 + Math.random() * 8);
    this.downsample = Math.floor(2 + Math.random() * 24);
    this.mix = 0.8 + Math.random() * 0.2;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.bits !== undefined) this.bits = clamp(Math.round(p.bits), 1, 16);
    if (p.downsample !== undefined) this.downsample = clamp(Math.round(p.downsample), 1, 64);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return {
      bits: this.bits,
      downsample: this.downsample,
      mix: this.mix,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const steps = Math.pow(2, this.bits - 1);
    const invSteps = 1.0 / steps;
    const ds = Math.max(1, this.downsample);
    const mix = this.mix;
    const dry = 1.0 - mix;

    let held = this.heldSample;
    let cnt = this.sampleCounter;

    for (let i = 0; i < len; i++) {
      const inSample = samples[i];

      // Sample-and-hold decimation
      if (cnt % ds === 0) {
        // Bit-depth quantization
        held = Math.round(inSample * steps) * invSteps;
      }
      cnt++;

      const out = inSample * dry + held * mix;
      samples[i] = out < -1.0 ? -1.0 : out > 1.0 ? 1.0 : out;
    }

    this.heldSample = held;
    this.sampleCounter = cnt % ds;
  }
}

// 2. West-Coast Wavefolder (Buchla / Serge style nonlinear wavefolder)
// In audio: folds overdriven peaks back downwards repeatedly, generating rich odd/even overtone cascades.
// In video: psychedelic color folding, transforming bright highlights into inverted complementary colors and zebra contours.
export class WavefolderFilter extends BaseDspFilter {
  drive = 2.5;       // 1 to 10
  folds = 3;         // 1 to 6
  symmetry = 0.0;    // -1 to 1 (DC bias asymmetry)

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {}

  randomize(): void {
    this.drive = 1.5 + Math.random() * 6;
    this.folds = Math.floor(1 + Math.random() * 5);
    this.symmetry = -0.3 + Math.random() * 0.6;
  }

  setParams(p: Record<string, number>): void {
    if (p.drive !== undefined) this.drive = clamp(p.drive, 1, 10);
    if (p.folds !== undefined) this.folds = clamp(Math.round(p.folds), 1, 6);
    if (p.symmetry !== undefined) this.symmetry = clamp(p.symmetry, -1, 1);
  }

  getParams(): Record<string, number> {
    return {
      drive: this.drive,
      folds: this.folds,
      symmetry: this.symmetry,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const drv = this.drive;
    const sym = this.symmetry;
    const numFolds = this.folds;

    for (let i = 0; i < len; i++) {
      // Apply drive and DC asymmetry
      let s = (samples[i] + sym) * drv;

      // Iterative triangle wavefolding
      for (let f = 0; f < numFolds; f++) {
        if (s > 1.0) {
          s = 2.0 - s;
        } else if (s < -1.0) {
          s = -2.0 - s;
        }
      }

      // Smooth soft tanh limiter on final output
      samples[i] = Math.tanh(s);
    }
  }
}
