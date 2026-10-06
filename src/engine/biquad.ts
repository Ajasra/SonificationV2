// Direct-Form II Transposed Biquad Filter Engine
// Ported from LADSPA util/biquad.h & Processing biquad.pde

const LN_2_2 = Math.log(2.0) / 2.0;
const LN2 = Math.log(2.0);

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export class Biquad {
  a1 = 0;
  a2 = 0;
  b0 = 1;
  b1 = 0;
  b2 = 0;
  x1 = 0;
  x2 = 0;
  y1 = 0;
  y2 = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  eqSetParams(fc: number, gain: number, bw: number, fs: number): void {
    const w = (2.0 * Math.PI * clamp(fc, 1.0, fs / 2.0)) / fs;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const J = Math.pow(10.0, gain * 0.025);
    const g = sw * Math.sinh((LN_2_2 * clamp(bw, 0.0001, 4.0) * w) / sw);
    const a0r = 1.0 / (1.0 + g / J);

    this.b0 = (1.0 + g * J) * a0r;
    this.b1 = -2.0 * cw * a0r;
    this.b2 = (1.0 - g * J) * a0r;
    this.a1 = -this.b1;
    this.a2 = (g / J - 1.0) * a0r;
  }

  lsSetParams(fc: number, gain: number, slope: number, fs: number): void {
    const w = (2.0 * Math.PI * clamp(fc, 1.0, fs / 2.0)) / fs;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const A = Math.pow(10.0, gain * 0.025);
    const b = Math.sqrt((1.0 + A * A) / clamp(slope, 0.0001, 1.0) - Math.pow(A - 1.0, 2.0));
    const apc = cw * (A + 1.0);
    const amc = cw * (A - 1.0);
    const bs = b * sw;
    const a0r = 1.0 / (A + 1.0 + amc + bs);

    this.b0 = a0r * A * (A + 1.0 - amc + bs);
    this.b1 = a0r * 2.0 * A * (A - 1.0 - apc);
    this.b2 = a0r * A * (A + 1.0 - amc - bs);
    this.a1 = a0r * 2.0 * (A - 1.0 + apc);
    this.a2 = a0r * (-A - 1.0 - amc + bs);
  }

  hsSetParams(fc: number, gain: number, slope: number, fs: number): void {
    const w = (2.0 * Math.PI * clamp(fc, 1.0, fs / 2.0)) / fs;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const A = Math.pow(10.0, gain * 0.025);
    const b = Math.sqrt((1.0 + A * A) / clamp(slope, 0.0001, 1.0) - Math.pow(A - 1.0, 2.0));
    const apc = cw * (A + 1.0);
    const amc = cw * (A - 1.0);
    const bs = b * sw;
    const a0r = 1.0 / (A + 1.0 - amc + bs);

    this.b0 = a0r * A * (A + 1.0 + amc + bs);
    this.b1 = a0r * -2.0 * A * (A - 1.0 + apc);
    this.b2 = a0r * A * (A + 1.0 + amc - bs);
    this.a1 = a0r * -2.0 * (A - 1.0 - apc);
    this.a2 = a0r * (-A - 1.0 + amc + bs);
  }

  lpSetParams(fc: number, bw: number, fs: number): void {
    const omega = (2.0 * Math.PI * fc) / fs;
    const sn = Math.sin(omega);
    const cs = Math.cos(omega);
    const alpha = sn * Math.sinh(((LN2 / 2.0) * bw * omega) / sn);
    const a0r = 1.0 / (1.0 + alpha);

    this.b0 = a0r * (1.0 - cs) * 0.5;
    this.b1 = a0r * (1.0 - cs);
    this.b2 = a0r * (1.0 - cs) * 0.5;
    this.a1 = a0r * (2.0 * cs);
    this.a2 = a0r * (alpha - 1.0);
  }

  hpSetParams(fc: number, bw: number, fs: number): void {
    const omega = (2.0 * Math.PI * fc) / fs;
    const sn = Math.sin(omega);
    const cs = Math.cos(omega);
    const alpha = sn * Math.sinh(((LN2 / 2.0) * bw * omega) / sn);
    const a0r = 1.0 / (1.0 + alpha);

    this.b0 = a0r * (1.0 + cs) * 0.5;
    this.b1 = a0r * -(1.0 + cs);
    this.b2 = a0r * (1.0 + cs) * 0.5;
    this.a1 = a0r * (2.0 * cs);
    this.a2 = a0r * (alpha - 1.0);
  }

  bpSetParams(fc: number, bw: number, fs: number): void {
    const omega = (2.0 * Math.PI * fc) / fs;
    const sn = Math.sin(omega);
    const cs = Math.cos(omega);
    const alpha = sn * Math.sinh(((LN2 / 2.0) * bw * omega) / sn);
    const a0r = 1.0 / (1.0 + alpha);

    this.b0 = a0r * alpha;
    this.b1 = 0.0;
    this.b2 = a0r * -alpha;
    this.a1 = a0r * (2.0 * cs);
    this.a2 = a0r * (alpha - 1.0);
  }

  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 + this.a1 * this.y1 + this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y !== y ? 0 : y;
  }
}
