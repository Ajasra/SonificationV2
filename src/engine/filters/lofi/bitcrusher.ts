import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

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

export const filter: FilterModule = {
  descriptor: {
    id: 'bitcrusher',
    name: 'Bitcrusher & Decimator',
    category: 'lofi',
    description: 'Bit-depth quantization and sample-rate decimation for chiptune crunch.',
    defaultSampleRate: 44100,
    params: [
      { name: 'bits', label: 'Bit Depth', type: 'int', min: 1, max: 16, step: 1, value: 6, tooltip: 'Bit resolution reduction (1-16 bits)' },
      { name: 'downsample', label: 'Decimate', type: 'int', min: 1, max: 64, step: 1, value: 8, tooltip: 'Sample rate decimation factor for aliasing tones' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'Dry/wet balance' },
    ],
  },
  create: (sr) => new BitcrusherFilter(sr),
};
