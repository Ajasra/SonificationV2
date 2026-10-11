import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp } from '../util.ts';

// 5. Rutt-Etra Raster Deflector (1973 Scan Deflection Video Synthesizer)
// Deflects horizontal scanlines vertically according to luminance voltage
// and audio signal amplitude, creating authentic 3D oscilloscope topographic landscape relief.
export class RuttEtraFilter extends BaseVideoFilter {
  deflect = 24;       // 0 to 60 (vertical deflection height in pixels)
  density = 4;        // 1 to 10 (scanline spacing / decimation step)
  audioMod = 1.0;     // 0 to 2 (cross-modulation sensitivity from audio RMS/peak)
  brightness = 1.4;   // 0.5 to 2.5 (line intensity gain)

  private scratchBuffer = new Uint8ClampedArray(0);

  init(width: number, height: number): void {
    super.init(width, height);
    const sz = width * height * 4;
    if (this.scratchBuffer.length < sz) {
      this.scratchBuffer = new Uint8ClampedArray(sz);
    }
  }

  randomize(): void {
    this.deflect = Math.round(10 + Math.random() * 35);
    this.density = Math.floor(2 + Math.random() * 5);
    this.audioMod = +(0.5 + Math.random() * 1.2).toFixed(1);
    this.brightness = +(1.0 + Math.random() * 1.0).toFixed(1);
  }

  setParams(p: Record<string, number>): void {
    if (p.deflect !== undefined) this.deflect = clamp(p.deflect, 0, 60);
    if (p.density !== undefined) this.density = clamp(Math.round(p.density), 1, 10);
    if (p.audioMod !== undefined) this.audioMod = clamp(p.audioMod, 0, 2);
    if (p.brightness !== undefined) this.brightness = clamp(p.brightness, 0.5, 2.5);
  }

  getParams(): Record<string, number> {
    return {
      deflect: this.deflect,
      density: this.density,
      audioMod: this.audioMod,
      brightness: this.brightness,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height } = ctx;
    if (width <= 0 || height <= 0) return;

    const sz = width * height * 4;
    if (this.scratchBuffer.length < sz) {
      this.scratchBuffer = new Uint8ClampedArray(sz);
    }

    // Copy original input to scratch buffer to read from
    this.scratchBuffer.set(rgba.subarray(0, sz));
    const src = this.scratchBuffer;

    // Clear output to dark CRT background with alpha=255 in 1 packed pass
    new Uint32Array(rgba.buffer, rgba.byteOffset, width * height).fill(0xff080808);

    const step = this.density;
    const def = this.deflect;
    const bright = this.brightness;

    // Cross-modulation from audio engine
    const audioAmp = (ctx.audioPeak ?? ctx.audioRms ?? 0) * this.audioMod * 20;
    const invLumaScale = 1.0 / (256 * 255);
    const rowBytes = width * 4;

    for (let y = 0; y < height; y += step) {
      const srcRowOffset = y * rowBytes;

      for (let x = 0; x < width; x++) {
        const srcIdx = srcRowOffset + x * 4;
        const r = src[srcIdx];
        const g = src[srcIdx + 1];
        const b = src[srcIdx + 2];

        // Luminance voltage (0 to 1)
        const lumaNorm = (r * 77 + g * 150 + b * 29) * invLumaScale;

        // Calculate vertical deflection: deflect upward in proportion to brightness + audio
        const dy = Math.round((lumaNorm * def) + (audioAmp * Math.sin(x * 0.05 + y * 0.02)));
        const targetY = y - dy;

        if (targetY >= 0 && targetY < height) {
          const dstIdx = (targetY * width + x) * 4;

          // Paint deflected raster point with phosphor brilliance boost
          const pR = (r * bright + 0.5) | 0;
          const pG = (g * bright + 0.5) | 0;
          const pB = (b * bright + 0.5) | 0;
          rgba[dstIdx] = pR > 255 ? 255 : pR;
          rgba[dstIdx + 1] = pG > 255 ? 255 : pG;
          rgba[dstIdx + 2] = pB > 255 ? 255 : pB;

          // Subtle vertical beam trail / thickness
          if (step > 2 && targetY + 1 < height) {
            const dstBelow = dstIdx + rowBytes;
            const bR = (pR * 0.45 + 0.5) | 0;
            const bG = (pG * 0.45 + 0.5) | 0;
            const bB = (pB * 0.45 + 0.5) | 0;
            rgba[dstBelow] = bR > 255 ? 255 : bR;
            rgba[dstBelow + 1] = bG > 255 ? 255 : bG;
            rgba[dstBelow + 2] = bB > 255 ? 255 : bB;
          }
        }
      }
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'ruttetra',
    name: 'Rutt-Etra Deflector',
    category: 'raster',
    description: 'Rutt-Etra scan deflection synthesizer (1973): deflects scanlines vertically based on luminance and audio CV.',
    params: [
      { name: 'deflect', label: 'Deflect Height', type: 'float', min: 0, max: 60, step: 1, value: 24, tooltip: 'Maximum vertical deflection height driven by luminance' },
      { name: 'density', label: 'Scanline Step', type: 'int', min: 1, max: 10, step: 1, value: 4, tooltip: 'Vertical scanline decimation spacing' },
      { name: 'audioMod', label: 'Audio CV Mod', type: 'float', min: 0, max: 2, step: 0.1, value: 1.0, tooltip: 'Cross-modulation sensitivity from live audio signal amplitude' },
      { name: 'brightness', label: 'Beam Gain', type: 'float', min: 0.5, max: 2.5, step: 0.1, value: 1.4, tooltip: 'Electron beam brightness intensity multiplier' },
    ],
  },
  create: () => new RuttEtraFilter(),
};
