import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp, clampByte } from '../util.ts';

// 13. RF Multipath Tuner & Antenna Ghosting
// Simulates analog VHF/UHF broadcast television demodulation: antenna multipath
// reflections (delayed ghost echoes), 60Hz AC ground-loop hum bar, and tuner snow hiss.
export class RfTunerFilter extends BaseVideoFilter {
  ghostOffset = 24;  // 2 to 80 (distance in pixels of multipath ghost reflection)
  ghostGain = 0.35;  // 0.0 to 0.8 (amplitude of the delayed ghost echo)
  rfNoise = 0.18;    // 0.0 to 0.6 (antenna snowy noise hiss level)
  humBar = 0.20;     // 0.0 to 0.5 (60Hz ground loop AC hum rolling bar)
  fineTune = 0.0;    // -1.0 to 1.0 (VHF tuner carrier frequency drift)

  private seed = 123456789;

  randomize(): void {
    this.ghostOffset = Math.round(5 + Math.random() * 50);
    this.ghostGain = +(0.15 + Math.random() * 0.5).toFixed(2);
    this.rfNoise = +(0.08 + Math.random() * 0.35).toFixed(2);
    this.humBar = +(0.1 + Math.random() * 0.35).toFixed(2);
    this.fineTune = +(-0.5 + Math.random() * 1.0).toFixed(2);
  }

  setParams(p: Record<string, number>): void {
    if (p.ghostOffset !== undefined) this.ghostOffset = clamp(Math.round(p.ghostOffset), 2, 80);
    if (p.ghostGain !== undefined) this.ghostGain = clamp(p.ghostGain, 0.0, 0.8);
    if (p.rfNoise !== undefined) this.rfNoise = clamp(p.rfNoise, 0.0, 0.6);
    if (p.humBar !== undefined) this.humBar = clamp(p.humBar, 0.0, 0.5);
    if (p.fineTune !== undefined) this.fineTune = clamp(p.fineTune, -1.0, 1.0);
  }

  getParams(): Record<string, number> {
    return {
      ghostOffset: this.ghostOffset,
      ghostGain: this.ghostGain,
      rfNoise: this.rfNoise,
      humBar: this.humBar,
      fineTune: this.fineTune,
    };
  }

  private nextNoise(): number {
    // Fast 32-bit xorshift PRNG
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >> 17;
    this.seed ^= this.seed << 5;
    return ((this.seed >>> 0) % 256) - 128;
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height, timeMs } = ctx;
    const offset = this.ghostOffset;
    const gain = this.ghostGain;
    let noiseAmt = this.rfNoise;
    const hum = this.humBar;
    const drift = this.fineTune;

    // Cross-modulation: audio transients inject momentary antenna static
    if (ctx.audioPeak && ctx.audioPeak > 0.1) {
      noiseAmt += (ctx.audioPeak - 0.1) * 0.3;
    }

    // 60Hz rolling hum phase
    const humSpeed = 0.0025;
    const humFreq = 0.015;
    const humTimeOffset = timeMs * humSpeed;

    const noiseScale = noiseAmt * 1.5;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 4;
      // Rolling AC ground hum ripple
      const humVal = Math.sin(y * humFreq - humTimeOffset) * hum * 45;

      for (let x = 0; x < width; x++) {
        const i = rowOffset + x * 4;
        let r = rgba[i];
        let g = rgba[i + 1];
        let b = rgba[i + 2];

        // Multipath ghost reflection sampled from delayed horizontal pixel
        if (x >= offset) {
          const ghostIdx = rowOffset + (x - offset) * 4;
          r += rgba[ghostIdx] * gain;
          g += rgba[ghostIdx + 1] * gain;
          b += rgba[ghostIdx + 2] * gain;
        }

        // Apply ground hum modulation
        if (hum > 0.01) {
          r += humVal;
          g += humVal;
          b += humVal;
        }

        // Apply snowy RF static
        if (noiseAmt > 0.01) {
          const n = this.nextNoise() * noiseScale;
          r += n;
          g += n;
          b += n;
        }

        // Carrier frequency drift chroma distortion
        if (drift !== 0) {
          const driftOffset = drift * 20;
          r += driftOffset;
          b -= driftOffset;
        }

        rgba[i] = clampByte(r);
        rgba[i + 1] = clampByte(g);
        rgba[i + 2] = clampByte(b);
      }
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'rftuner',
    name: 'RF Multipath Tuner',
    category: 'sync',
    description: 'Analog VHF/UHF broadcast television demodulator: multipath antenna ghosting, 60Hz AC hum bar, and RF snow static.',
    params: [
      { name: 'ghostOffset', label: 'Ghost Distance', type: 'int', min: 2, max: 80, step: 1, value: 24, tooltip: 'Pixel delay offset of multipath antenna reflection' },
      { name: 'ghostGain', label: 'Ghost Gain', type: 'float', min: 0.0, max: 0.8, step: 0.02, value: 0.35, tooltip: 'Amplitude intensity of delayed ghost reflections' },
      { name: 'rfNoise', label: 'RF Snow Static', type: 'float', min: 0.0, max: 0.6, step: 0.02, value: 0.18, tooltip: 'High-frequency broadcast antenna snow hiss' },
      { name: 'humBar', label: '60Hz Ground Hum', type: 'float', min: 0.0, max: 0.5, step: 0.02, value: 0.20, tooltip: 'Rolling 60Hz AC power line ground-loop hum band' },
      { name: 'fineTune', label: 'Carrier Drift', type: 'float', min: -1.0, max: 1.0, step: 0.05, value: 0.0, tooltip: 'VHF/UHF tuner local oscillator carrier drift' },
    ],
  },
  create: () => new RfTunerFilter(),
};
