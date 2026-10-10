import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

// Transient Shaper: threshold-free attack/sustain control from fast vs slow envelope followers.
export class TransientShaperFilter extends BaseDspFilter {
  attack = 0.5;    // -1..1
  sustain = 0.0;   // -1..1

  private fast = 0;
  private slow = 0;
  private gain = 1;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.fast = 0;
    this.slow = 0;
    this.gain = 1;
  }

  randomize(): void {
    this.attack = Math.random() * 2 - 1;
    this.sustain = Math.random() * 2 - 1;
  }

  setParams(p: Record<string, number>): void {
    if (p.attack !== undefined) this.attack = clamp(p.attack, -1, 1);
    if (p.sustain !== undefined) this.sustain = clamp(p.sustain, -1, 1);
  }

  getParams(): Record<string, number> {
    return { attack: this.attack, sustain: this.sustain };
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const sr = this.sampleRate;
    const fastA = Math.exp(-1 / (0.001 * sr));
    const slowA = Math.exp(-1 / (0.03 * sr));
    const smooth = 1 - Math.exp(-1 / (0.0005 * sr));
    const att = this.attack;
    const sus = this.sustain;
    let fast = this.fast, slow = this.slow, g = this.gain;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      const a = Math.abs(x);
      fast = a > fast ? a : fastA * fast + (1 - fastA) * a;
      slow = a > slow ? slowA * slow + (1 - slowA) * a : slowA * slow + (1 - slowA) * a;
      const ref = slow + 1e-4;
      const rising = clamp((fast - slow) / ref, 0, 1);
      const falling = clamp((slow - fast) / ref, 0, 1);
      const target = clamp(1 + att * 2 * rising + sus * 2 * falling, 0.05, 4);
      g += (target - g) * smooth;
      samples[i] = x * g;
    }

    this.fast = fast; this.slow = slow; this.gain = g;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'transient',
    name: 'Transient Shaper',
    category: 'dynamics',
    description: 'Boost or soften attacks and sustain with no threshold to set.',
    defaultSampleRate: 44100,
    params: [
      { name: 'attack', label: 'Attack', type: 'float', min: -1, max: 1, step: 0.05, value: 0.5, tooltip: 'Positive = punchier, negative = softer onsets' },
      { name: 'sustain', label: 'Sustain', type: 'float', min: -1, max: 1, step: 0.05, value: 0, tooltip: 'Positive = longer tails, negative = tighter' },
    ],
  },
  create: (sr) => new TransientShaperFilter(sr),
};
