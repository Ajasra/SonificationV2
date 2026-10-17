import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { clamp, TWO_PI } from '../util.ts';

// 3. Pitch Shifter: dual crossfaded delay-line heads (granular style).
export class PitchShifterFilter extends BaseDspFilter {
  semitones = 7;
  window = 50;     // ms
  mix = 1.0;

  private buf = new Float32Array(0);
  private pos = 0;
  private phase = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    this.buf = new Float32Array(Math.ceil(this.sampleRate * 0.25) + 4);
    this.pos = 0;
    this.phase = 0;
  }

  randomize(): void {
    this.semitones = Math.round(Math.random() * 24 - 12);
    this.window = 30 + Math.random() * 100;
    this.mix = 0.7 + Math.random() * 0.3;
  }

  setParams(p: Record<string, number>): void {
    if (p.semitones !== undefined) this.semitones = clamp(p.semitones, -24, 24);
    if (p.window !== undefined) this.window = clamp(p.window, 10, 200);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0, 1);
  }

  getParams(): Record<string, number> {
    return { semitones: this.semitones, window: this.window, mix: this.mix };
  }

  private read(buf: Float32Array, pos: number, delay: number): number {
    const size = buf.length;
    let rp = pos - delay;
    if (rp < 0) rp += size;
    const i0 = Math.floor(rp);
    const f = rp - i0;
    const next = i0 + 1 === size ? 0 : i0 + 1;
    const a = buf[i0];
    const b = buf[next];
    return a + (b - a) * f;
  }

  private readReference(buf: Float32Array, pos: number, delay: number): number {
    const size = buf.length;
    let rp = pos - delay;
    while (rp < 0) rp += size;
    const i0 = Math.floor(rp);
    const f = rp - i0;
    const a = buf[i0 % size];
    const b = buf[(i0 + 1) % size];
    return a + (b - a) * f;
  }

  processBlock(samples: Float32Array): void {
    const len = samples.length;
    const buf = this.buf;
    const size = buf.length;
    const winSamples = (this.window / 1000) * this.sampleRate;
    const ratio = Math.pow(2, this.semitones / 12);
    const inc = (1 - ratio) / winSamples;
    const mix = this.mix;
    const dry = 1 - mix;
    let pos = this.pos;
    let ph = this.phase;

    for (let i = 0; i < len; i++) {
      const x = samples[i];
      buf[pos] = x;

      const ph2 = ph + 0.5 >= 1 ? ph - 0.5 : ph + 0.5;
      const w1 = 0.5 - 0.5 * Math.cos(TWO_PI * ph);
      const w2 = 0.5 - 0.5 * Math.cos(TWO_PI * ph2);
      const wet =
        this.read(buf, pos, ph * winSamples + 1) * w1 +
        this.read(buf, pos, ph2 * winSamples + 1) * w2;

      ph += inc;
      if (ph >= 1) ph -= 1;
      else if (ph < 0) ph += 1;
      if (++pos >= size) pos = 0;

      samples[i] = x * dry + wet * mix;
    }

    this.pos = pos;
    this.phase = ph;
  }

  processBlockReference(samples: Float32Array): void {
    const len=samples.length,buf=this.buf,size=buf.length,winSamples=(this.window/1000)*this.sampleRate,ratio=Math.pow(2,this.semitones/12),inc=(1-ratio)/winSamples,mix=this.mix,dry=1-mix;
    let pos=this.pos,ph=this.phase;
    for(let i=0;i<len;i++){
      const x=samples[i];buf[pos]=x;const ph2=ph+.5>=1?ph-.5:ph+.5,w1=.5-.5*Math.cos(TWO_PI*ph),w2=.5-.5*Math.cos(TWO_PI*ph2);
      const wet=this.readReference(buf,pos,ph*winSamples+1)*w1+this.readReference(buf,pos,ph2*winSamples+1)*w2;
      ph+=inc;if(ph>=1)ph-=1;else if(ph<0)ph+=1;if(++pos>=size)pos=0;samples[i]=x*dry+wet*mix;
    }
    this.pos=pos;this.phase=ph;
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'pitchshift',
    name: 'Pitch Shifter',
    category: 'synth',
    description: 'Granular dual-head pitch shifter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'semitones', label: 'Semitones', type: 'float', min: -24, max: 24, step: 0.5, value: 7, tooltip: 'Pitch shift amount' },
      { name: 'window', label: 'Window (ms)', type: 'float', min: 10, max: 200, step: 5, value: 50, tooltip: 'Grain window size' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'Dry/wet balance' },
    ],
  },
  create: (sr) => new PitchShifterFilter(sr),
};
