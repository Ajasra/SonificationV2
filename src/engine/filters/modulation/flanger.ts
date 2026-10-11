import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp, SIN_TABLE, SIN_TABLE_MASK, RAD_TO_SIN_IDX, TWO_PI } from '../util.ts';

// 2. Stereo Flanger & Chorus
// In audio: comb filter sweeps with modulated delay (0.5 to 20ms) and feedback. Jet-plane woosh or rich chorus ensemble.
// In video: shimmering holographic diffraction lines and horizontal raster displacement.
export class FlangerFilter extends BaseDspFilter {
  rate = 0.4;        // LFO rate in Hz (0.05 to 10)
  depth = 3.0;       // Sweep depth in ms (0.5 to 10)
  feedback = 0.6;    // Feedback (-0.95 to 0.95)
  delayMs = 2.0;     // Base delay in ms (0.5 to 20)
  mix = 0.5;         // Dry/wet (0 to 1)

  private static readonly BUFFER_SIZE = 4096; // ~92 ms at 44.1kHz
  private static readonly BUFFER_MASK = 4095;
  private buffer = new Float32Array(FlangerFilter.BUFFER_SIZE);
  private writePos = 0;
  private lfoPhase = 0.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.buffer.fill(0);
    this.writePos = 0;
    this.lfoPhase = 0.0;
  }

  randomize(): void {
    this.rate = 0.1 + Math.random() * 2.5;
    this.depth = 1.0 + Math.random() * 6.0;
    this.feedback = -0.7 + Math.random() * 1.4;
    this.delayMs = 1.0 + Math.random() * 10.0;
    this.mix = 0.3 + Math.random() * 0.5;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.rate !== undefined) this.rate = clamp(p.rate, 0.05, 10);
    if (p.depth !== undefined) this.depth = clamp(p.depth, 0.5, 10);
    if (p.feedback !== undefined) this.feedback = clamp(p.feedback, -0.95, 0.95);
    if (p.delayMs !== undefined) this.delayMs = clamp(p.delayMs, 0.5, 20);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return {
      rate: this.rate,
      depth: this.depth,
      feedback: this.feedback,
      delayMs: this.delayMs,
      mix: this.mix,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const fs = this.sampleRate;
    const buf = this.buffer;
    const mask = FlangerFilter.BUFFER_MASK;
    const lfoInc = (TWO_PI * this.rate) / fs;
    const fb = this.feedback;
    const mix = this.mix;
    const dry = 1.0 - mix;

    let wpos = this.writePos;
    let lfo = this.lfoPhase;

    for (let i = 0; i < len; i++) {
      // Modulated delay time in samples
      const sinVal = SIN_TABLE[((lfo * RAD_TO_SIN_IDX) | 0) & SIN_TABLE_MASK];
      const currentDelayMs = this.delayMs + this.depth * 0.5 * (1.0 + sinVal);
      const delaySamples = clamp((currentDelayMs * 0.001) * fs, 1, mask - 2);

      lfo += lfoInc;
      if (lfo >= TWO_PI) lfo -= TWO_PI;

      // Linear interpolation read
      const readPosExact = wpos - delaySamples;
      const readPosInt = Math.floor(readPosExact);
      const frac = readPosExact - readPosInt;

      const s0 = buf[readPosInt & mask];
      const s1 = buf[(readPosInt + 1) & mask];
      const delayedSample = s0 + frac * (s1 - s0);

      const inSample = samples[i];
      buf[wpos] = inSample + fb * delayedSample;
      wpos = (wpos + 1) & mask;

      samples[i] = inSample * dry + delayedSample * mix;
    }

    this.writePos = wpos;
    this.lfoPhase = lfo;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'flanger',
    name: 'Flanger & Chorus',
    category: 'modulation',
    description: 'Modulated delay line with feedback for jet-plane sweeps and lush chorus.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (Hz)', type: 'float', min: 0.05, max: 10, step: 0.05, value: 0.4, tooltip: 'LFO modulation frequency in Hz' },
      { name: 'depth', label: 'Depth (ms)', type: 'float', min: 0.5, max: 10, step: 0.25, value: 3.0, tooltip: 'Delay time modulation excursion depth' },
      { name: 'feedback', label: 'Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0.6, tooltip: 'Regenerative comb feedback for jet sweep intensity' },
      { name: 'delayMs', label: 'Delay (ms)', type: 'float', min: 0.5, max: 20, step: 0.5, value: 2.0, tooltip: 'Center delay offset (chorus vs flanger range)' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.5, tooltip: 'Mix blend ratio' },
    ],
  },
  create: (sr) => new FlangerFilter(sr),
};
