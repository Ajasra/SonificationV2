// Advanced Modulation: Ring Modulator, Stereo Flanger / Chorus, Tremolo
import { BaseDspFilter } from './base.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// 1. Ring Modulator
// In audio: non-harmonic sidebands, sci-fi Dalek robotic timbre, metallic clangorous bells.
// In video: dense moiré interference patterns and periodic horizontal chromatic lattices.
export class RingModFilter extends BaseDspFilter {
  freq = 440.0;      // Hz (10 to 4000)
  waveform = 0;      // 0 = Sine, 1 = Triangle, 2 = Square
  mix = 0.85;        // 0 to 1

  private phase = 0.0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.phase = 0.0;
  }

  randomize(): void {
    this.freq = 40 + Math.random() * 1800;
    this.waveform = Math.floor(Math.random() * 3);
    this.mix = 0.6 + Math.random() * 0.4;
  }

  setParams(p: Record<string, number>): void {
    if (p.freq !== undefined) this.freq = clamp(p.freq, 10, 4000);
    if (p.waveform !== undefined) this.waveform = clamp(Math.round(p.waveform), 0, 2);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return {
      freq: this.freq,
      waveform: this.waveform,
      mix: this.mix,
    };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const fs = this.sampleRate;
    const phaseInc = (2.0 * Math.PI * this.freq) / fs;
    const mix = this.mix;
    const dry = 1.0 - mix;
    const wf = this.waveform;
    let ph = this.phase;

    for (let i = 0; i < len; i++) {
      let carrier = 0.0;
      if (wf === 0) {
        // Sine
        carrier = Math.sin(ph);
      } else if (wf === 1) {
        // Triangle
        const norm = (ph / (2.0 * Math.PI)) % 1.0;
        carrier = norm < 0.5 ? 4.0 * norm - 1.0 : 3.0 - 4.0 * norm;
      } else {
        // Square
        carrier = Math.sin(ph) >= 0 ? 1.0 : -1.0;
      }

      ph += phaseInc;
      if (ph >= 2.0 * Math.PI) ph -= 2.0 * Math.PI;

      const mod = samples[i] * carrier;
      samples[i] = samples[i] * dry + mod * mix;
    }

    this.phase = ph;
  }
}

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
    const lfoInc = (2.0 * Math.PI * this.rate) / fs;
    const fb = this.feedback;
    const mix = this.mix;
    const dry = 1.0 - mix;

    let wpos = this.writePos;
    let lfo = this.lfoPhase;

    for (let i = 0; i < len; i++) {
      // Modulated delay time in samples
      const currentDelayMs = this.delayMs + this.depth * 0.5 * (1.0 + Math.sin(lfo));
      const delaySamples = clamp((currentDelayMs * 0.001) * fs, 1, mask - 2);

      lfo += lfoInc;
      if (lfo >= 2.0 * Math.PI) lfo -= 2.0 * Math.PI;

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
