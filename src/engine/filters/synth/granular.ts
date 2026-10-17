import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp } from '../util.ts';

const MAX_GRAINS = 24;

// Granular Cloud: overlapping Hann-windowed grains read from a live buffer with pitch and position scatter.
export class GranularFilter extends BaseDspFilter {
  size = 80;           // ms
  density = 12;        // grains / s
  pitchScatter = 3;    // semitones
  posJitter = 100;     // ms
  mix = 0.8;

  private buf = new Float32Array(0);
  private pos = 0;
  private active = new Uint8Array(MAX_GRAINS);
  private activeSlots = new Uint8Array(MAX_GRAINS);
  private activeCount = 0;
  private start = new Float64Array(MAX_GRAINS); // read position at age 0
  private age = new Float64Array(MAX_GRAINS);
  private len = new Float64Array(MAX_GRAINS);
  private ratio = new Float64Array(MAX_GRAINS);

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.buf = new Float32Array(Math.ceil(this.sampleRate * 2));
    this.pos = 0;
    this.active.fill(0);
    this.activeSlots.fill(0);
    this.activeCount = 0;
    this.age.fill(0);
  }

  randomize(): void {
    this.size = 20 + Math.random() * 200;
    this.density = 4 + Math.random() * 30;
    this.pitchScatter = Math.random() * 12;
    this.posJitter = Math.random() * 400;
    this.mix = 0.6 + Math.random() * 0.4;
  }

  setParams(p: Record<string, number>): void {
    if (p.size !== undefined) this.size = clamp(p.size, 10, 300);
    if (p.density !== undefined) this.density = clamp(p.density, 1, 50);
    if (p.pitchScatter !== undefined) this.pitchScatter = clamp(p.pitchScatter, 0, 12);
    if (p.posJitter !== undefined) this.posJitter = clamp(p.posJitter, 0, 500);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return { size: this.size, density: this.density, pitchScatter: this.pitchScatter, posJitter: this.posJitter, mix: this.mix };
  }

  private spawn(pos: number, size: number, grainLen: number): void {
    for (let g = 0; g < MAX_GRAINS; g++) {
      if (this.active[g]) continue;
      const ratio = Math.pow(2, ((Math.random() * 2 - 1) * this.pitchScatter) / 12);
      // Stay behind the record head even when reading faster than real-time
      const minOffset = grainLen * Math.max(1, ratio) + 2;
      const offset = minOffset + Math.random() * (this.posJitter / 1000) * this.sampleRate;
      this.start[g] = pos - Math.min(offset, size - grainLen * 2 - 2);
      this.age[g] = 0;
      this.len[g] = grainLen;
      this.ratio[g] = ratio;
      this.active[g] = 1;
      let insertAt = this.activeCount;
      while (insertAt > 0 && this.activeSlots[insertAt - 1] > g) {
        this.activeSlots[insertAt] = this.activeSlots[insertAt - 1];
        insertAt--;
      }
      this.activeSlots[insertAt] = g;
      this.activeCount++;
      return;
    }
  }

  processBlock(samples: Float32Array): void {
    const n = samples.length;
    const buf = this.buf;
    const size = buf.length;
    const grainLen = Math.max(16, (this.size / 1000) * this.sampleRate);
    const prob = this.density / this.sampleRate;
    const overlap = Math.max(1, this.density * (this.size / 1000));
    const norm = 1 / Math.sqrt(overlap);
    const mix = this.mix;
    const dry = 1 - mix;
    let pos = this.pos;

    for (let i = 0; i < n; i++) {
      const x = samples[i];
      buf[pos] = x;

      if (Math.random() < prob) this.spawn(pos, size, grainLen);

      let wet = 0;
      for (let slot = 0; slot < this.activeCount; slot++) {
        const g = this.activeSlots[slot];
        const a = this.age[g];
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * a) / this.len[g]);
        let rp = this.start[g] + a * this.ratio[g];
        rp = ((rp % size) + size) % size;
        const i0 = Math.floor(rp);
        const fr = rp - i0;
        wet += (buf[i0] + (buf[(i0 + 1) % size] - buf[i0]) * fr) * w;
        this.age[g] = a + 1;
        if (a + 1 >= this.len[g]) {
          this.active[g] = 0;
          for (let move = slot + 1; move < this.activeCount; move++) this.activeSlots[move - 1] = this.activeSlots[move];
          this.activeCount--;
          slot--;
        }
      }

      if (++pos >= size) pos = 0;
      samples[i] = x * dry + wet * norm * mix;
    }

    this.pos = pos;
  }

  processBlockReference(samples: Float32Array): void {
    const n = samples.length;
    const buf = this.buf;
    const size = buf.length;
    const grainLen = Math.max(16, (this.size / 1000) * this.sampleRate);
    const prob = this.density / this.sampleRate;
    const overlap = Math.max(1, this.density * (this.size / 1000));
    const norm = 1 / Math.sqrt(overlap);
    const mix = this.mix;
    const dry = 1 - mix;
    let pos = this.pos;

    for (let i = 0; i < n; i++) {
      const x = samples[i];
      buf[pos] = x;
      if (Math.random() < prob) this.spawnReference(pos, size, grainLen);

      let wet = 0;
      for (let g = 0; g < MAX_GRAINS; g++) {
        if (!this.active[g]) continue;
        const a = this.age[g];
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * a) / this.len[g]);
        let rp = this.start[g] + a * this.ratio[g];
        rp = ((rp % size) + size) % size;
        const i0 = Math.floor(rp);
        const fr = rp - i0;
        wet += (buf[i0] + (buf[(i0 + 1) % size] - buf[i0]) * fr) * w;
        this.age[g] = a + 1;
        if (a + 1 >= this.len[g]) this.active[g] = 0;
      }
      if (++pos >= size) pos = 0;
      samples[i] = x * dry + wet * norm * mix;
    }
    this.pos = pos;
  }

  private spawnReference(pos: number, size: number, grainLen: number): void {
    for (let g = 0; g < MAX_GRAINS; g++) {
      if (this.active[g]) continue;
      const ratio = Math.pow(2, ((Math.random() * 2 - 1) * this.pitchScatter) / 12);
      const minOffset = grainLen * Math.max(1, ratio) + 2;
      const offset = minOffset + Math.random() * (this.posJitter / 1000) * this.sampleRate;
      this.start[g] = pos - Math.min(offset, size - grainLen * 2 - 2);
      this.age[g] = 0;
      this.len[g] = grainLen;
      this.ratio[g] = ratio;
      this.active[g] = 1;
      return;
    }
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'granular',
    name: 'Granular Cloud',
    category: 'synth',
    description: 'Grain-based re-synthesis of the incoming stream with pitch and position scatter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'size', label: 'Grain (ms)', type: 'float', min: 10, max: 300, step: 5, value: 80, tooltip: 'Grain length' },
      { name: 'density', label: 'Density (/s)', type: 'float', min: 1, max: 50, step: 1, value: 12, tooltip: 'Grains spawned per second' },
      { name: 'pitchScatter', label: 'Pitch Scatter (st)', type: 'float', min: 0, max: 12, step: 0.5, value: 3, tooltip: 'Random pitch spread per grain' },
      { name: 'posJitter', label: 'Position Jitter (ms)', type: 'float', min: 0, max: 500, step: 10, value: 100, tooltip: 'Random lookback distance per grain' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.8, tooltip: 'Dry/wet balance' },
    ],
  },
  create: (sr) => new GranularFilter(sr),
};
