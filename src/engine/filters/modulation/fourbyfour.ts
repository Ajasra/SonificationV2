import type { FilterModule } from '../descriptor.ts';
import { BaseDspFilter } from '../base.ts';
import { PhasersAllPass } from './phaser-shared.ts';

// 11. FourByFourPole: SWH 16 allpass stages filter bank (4 poles x 4 stages)
export class FourByFourPoleFilter extends BaseDspFilter {
  f0 = 10;
  fb0 = 0;
  f1 = 10000;
  fb1 = 0;
  f2 = 15000;
  fb2 = 0;
  f3 = 20000;
  fb3 = 0;

  private ap = Array.from({ length: 16 }, () => new PhasersAllPass());
  private y0 = 0;
  private y1 = 0;
  private y2 = 0;
  private y3 = 0;

  constructor(sampleRate: number = 44100) {
    super(sampleRate);
    this.init();
  }

  init(): void {
    const rs = this.invSampleRate;
    let idx = 0;
    for (let i = 0; i < 4; i++) this.ap[idx++].setDelay(this.f0 * rs);
    for (let i = 0; i < 4; i++) this.ap[idx++].setDelay(this.f1 * rs);
    for (let i = 0; i < 4; i++) this.ap[idx++].setDelay(this.f2 * rs);
    for (let i = 0; i < 4; i++) this.ap[idx++].setDelay(this.f3 * rs);
    this.y0 = this.y1 = this.y2 = this.y3 = 0;
  }

  randomize(): void {
    this.f0 = Math.random() * 20000;
    this.f1 = Math.random() * 20000;
    this.f2 = Math.random() * 20000;
    this.f3 = Math.random() * 20000;
    this.fb0 = -1 + Math.random() * 2;
    this.fb1 = -1 + Math.random() * 2;
    this.fb2 = -1 + Math.random() * 2;
    this.fb3 = -1 + Math.random() * 2;
    this.init();
  }

  setParams(p: Record<string, number>): void {
    if (p.f0 !== undefined) this.f0 = p.f0;
    if (p.fb0 !== undefined) this.fb0 = p.fb0;
    if (p.f1 !== undefined) this.f1 = p.f1;
    if (p.fb1 !== undefined) this.fb1 = p.fb1;
    if (p.f2 !== undefined) this.f2 = p.f2;
    if (p.fb2 !== undefined) this.fb2 = p.fb2;
    if (p.f3 !== undefined) this.f3 = p.f3;
    if (p.fb3 !== undefined) this.fb3 = p.fb3;
    this.init();
  }

  getParams(): Record<string, number> {
    return {
      f0: this.f0,
      fb0: this.fb0,
      f1: this.f1,
      fb1: this.fb1,
      f2: this.f2,
      fb2: this.fb2,
      f3: this.f3,
      fb3: this.fb3,
    };
  }

  processBlock(samples: Float32Array): void {
    const ap=this.ap;let y0=this.y0,y1=this.y1,y2=this.y2,y3=this.y3;
    const fb0=this.fb0,fb1=this.fb1,fb2=this.fb2,fb3=this.fb3;
    for(let i=0;i<samples.length;i++){
      let x=samples[i]+y0*fb0;
      let a=ap[0],v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[1];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[2];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[3];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;y0=v;

      x=y0+y1*fb1;
      a=ap[4];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[5];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[6];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[7];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;y1=v;

      x=y1+y2*fb2;
      a=ap[8];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[9];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[10];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[11];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;y2=v;

      x=y2+y3*fb3;
      a=ap[12];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[13];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[14];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;x=v;
      a=ap[15];v=x*-a.a1+a.zm1;a.zm1=v*a.a1+x;y3=v;
      samples[i]=y3!==y3?0:y3;
    }
    this.y0=y0;this.y1=y1;this.y2=y2;this.y3=y3;
  }

  processBlockReference(samples: Float32Array): void {
    const len = samples.length;
    for (let i = 0; i < len; i++) {
      const s = samples[i];
      let idx = 0;
      this.y0 = this.ap[idx++].run(s + this.y0 * this.fb0);
      this.y0 = this.ap[idx++].run(this.y0);
      this.y0 = this.ap[idx++].run(this.y0);
      this.y0 = this.ap[idx++].run(this.y0);

      this.y1 = this.ap[idx++].run(this.y0 + this.y1 * this.fb1);
      this.y1 = this.ap[idx++].run(this.y1);
      this.y1 = this.ap[idx++].run(this.y1);
      this.y1 = this.ap[idx++].run(this.y1);

      this.y2 = this.ap[idx++].run(this.y1 + this.y2 * this.fb2);
      this.y2 = this.ap[idx++].run(this.y2);
      this.y2 = this.ap[idx++].run(this.y2);
      this.y2 = this.ap[idx++].run(this.y2);

      this.y3 = this.ap[idx++].run(this.y2 + this.y3 * this.fb3);
      this.y3 = this.ap[idx++].run(this.y3);
      this.y3 = this.ap[idx++].run(this.y3);
      this.y3 = this.ap[idx++].run(this.y3);

      samples[i] = this.y3 !== this.y3 ? 0 : this.y3;
    }
  }
}

export const filter: FilterModule = {
  descriptor: {
    id: 'fourbyfour',
    name: '4x4 Pole Filter Bank',
    category: 'modulation',
    description: '16 allpass stages grouped into 4 poles.',
    defaultSampleRate: 44100,
    params: [
      { name: 'f0', label: 'Freq 0 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 10, tooltip: 'Band 0 pole frequency' },
      { name: 'f1', label: 'Freq 1 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 10000, tooltip: 'Band 1 pole frequency' },
      { name: 'f2', label: 'Freq 2 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 15000, tooltip: 'Band 2 pole frequency' },
      { name: 'f3', label: 'Freq 3 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 20000, tooltip: 'Band 3 pole frequency' },
      { name: 'fb0', label: 'Feedback 0', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0, tooltip: 'Band 0 feedback amount' },
      { name: 'fb1', label: 'Feedback 1', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0, tooltip: 'Band 1 feedback amount' },
      { name: 'fb2', label: 'Feedback 2', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0, tooltip: 'Band 2 feedback amount' },
      { name: 'fb3', label: 'Feedback 3', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0, tooltip: 'Band 3 feedback amount' },
    ],
  },
  create: (sr) => new FourByFourPoleFilter(sr),
};
