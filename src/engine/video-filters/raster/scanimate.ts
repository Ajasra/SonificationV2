import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp, clampByte } from '../util.ts';

// 12. Computer Image Corporation Scanimate (1970s Analog Animation Computer)
// Converts analog video raster into glowing cathode ray oscilloscope vector beam
// traces with luminance deflection, audio CV modulation, and phosphor color simulation.
export class ScanimateFilter extends BaseVideoFilter {
  density = 4;       // 2 to 16 (raster scanline spacing in pixels)
  deflection = 16;   // -40 to 40 (vertical trace displacement by luminance)
  beamGlow = 1.2;    // 0.2 to 2.5 (vector beam intensity / blooming)
  phosphor = 0;      // 0: P1 Green, 1: P31 Cyan, 2: P7 Amber, 3: P4 B&W
  mix = 0.85;        // 0.0 to 1.0 (wet/dry blend)

  private scratch: Uint8ClampedArray = new Uint8ClampedArray(0);

  init(width: number, height: number): void {
    super.init(width, height);
    const size = width * height * 4;
    if (this.scratch.length !== size) {
      this.scratch = new Uint8ClampedArray(size);
    }
  }

  randomize(): void {
    this.density = Math.floor(2 + Math.random() * 8);
    this.deflection = Math.round(-30 + Math.random() * 60);
    this.beamGlow = +(0.6 + Math.random() * 1.5).toFixed(1);
    this.phosphor = Math.floor(Math.random() * 4);
    this.mix = +(0.6 + Math.random() * 0.4).toFixed(2);
  }

  setParams(p: Record<string, number>): void {
    if (p.density !== undefined) this.density = clamp(Math.round(p.density), 2, 16);
    if (p.deflection !== undefined) this.deflection = clamp(Math.round(p.deflection), -40, 40);
    if (p.beamGlow !== undefined) this.beamGlow = clamp(p.beamGlow, 0.2, 2.5);
    if (p.phosphor !== undefined) this.phosphor = clamp(Math.round(p.phosphor), 0, 3);
    if (p.mix !== undefined) this.mix = clamp(p.mix, 0.0, 1.0);
  }

  getParams(): Record<string, number> {
    return {
      density: this.density,
      deflection: this.deflection,
      beamGlow: this.beamGlow,
      phosphor: this.phosphor,
      mix: this.mix,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height } = ctx;
    const size = width * height * 4;

    if (this.scratch.length !== size) {
      this.init(width, height);
    }

    const scratch = this.scratch;
    scratch.fill(0); // Clear dark CRT phosphor background

    const stepY = this.density;
    let defScale = this.deflection / 128.0;
    const glow = this.beamGlow;

    // Cross-modulation: audio peak deflections
    if (ctx.audioPeak && ctx.audioPeak > 0.05) {
      defScale += (ctx.audioPeak - 0.05) * 0.4;
    }

    // Phosphor base colors
    let pR = 40, pG = 255, pB = 60; // P1 Green
    switch (this.phosphor) {
      case 1: pR = 30; pG = 230; pB = 255; break; // P31 Cyan-Blue
      case 2: pR = 255; pG = 170; pB = 30; break;  // P7 Amber
      case 3: pR = 230; pG = 240; pB = 255; break; // P4 White
    }

    // Trace raster scanlines and deflect vertically by luminance
    for (let baseY = 0; baseY < height; baseY += stepY) {
      const srcRow = baseY * width * 4;

      for (let x = 0; x < width; x++) {
        const srcIdx = srcRow + x * 4;
        const luma = (rgba[srcIdx] * 77 + rgba[srcIdx + 1] * 150 + rgba[srcIdx + 2] * 29) >> 8;

        // Vertical deflection offset
        const dy = Math.round((luma - 128) * defScale);
        const targetY = baseY + dy;

        if (targetY >= 0 && targetY < height) {
          const targetIdx = (targetY * width + x) * 4;
          const beamIntensity = (luma / 255.0) * glow;

          scratch[targetIdx] = clampByte(scratch[targetIdx] + pR * beamIntensity);
          scratch[targetIdx + 1] = clampByte(scratch[targetIdx + 1] + pG * beamIntensity);
          scratch[targetIdx + 2] = clampByte(scratch[targetIdx + 2] + pB * beamIntensity);

          // Subtle beam bloom above and below
          if (targetY > 0) {
            const above = targetIdx - width * 4;
            scratch[above] = clampByte(scratch[above] + pR * beamIntensity * 0.35);
            scratch[above + 1] = clampByte(scratch[above + 1] + pG * beamIntensity * 0.35);
            scratch[above + 2] = clampByte(scratch[above + 2] + pB * beamIntensity * 0.35);
          }
          if (targetY < height - 1) {
            const below = targetIdx + width * 4;
            scratch[below] = clampByte(scratch[below] + pR * beamIntensity * 0.35);
            scratch[below + 1] = clampByte(scratch[below + 1] + pG * beamIntensity * 0.35);
            scratch[below + 2] = clampByte(scratch[below + 2] + pB * beamIntensity * 0.35);
          }
        }
      }
    }

    // Blend vector trace output with dry input
    const wet = this.mix;
    const dry = 1.0 - wet;

    for (let i = 0; i < size; i += 4) {
      rgba[i] = clampByte(rgba[i] * dry + scratch[i] * wet);
      rgba[i + 1] = clampByte(rgba[i + 1] * dry + scratch[i + 1] * wet);
      rgba[i + 2] = clampByte(rgba[i + 2] * dry + scratch[i + 2] * wet);
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'scanimate',
    name: 'Scanimate Vector Beam',
    category: 'raster',
    description: '1970s Scanimate analog computer: oscilloscope raster vector deflection, audio CV modulation, and glowing phosphor persistence.',
    params: [
      { name: 'density', label: 'Raster Pitch', type: 'int', min: 2, max: 16, step: 1, value: 4, tooltip: 'Vector scanline vertical density pitch in pixels' },
      { name: 'deflection', label: 'Y Deflection', type: 'int', min: -40, max: 40, step: 1, value: 16, tooltip: 'Vertical electron beam deflection by luminance voltage' },
      { name: 'beamGlow', label: 'Beam Glow', type: 'float', min: 0.2, max: 2.5, step: 0.1, value: 1.2, tooltip: 'Oscilloscope vector beam intensity and blooming' },
      { name: 'phosphor', label: 'Phosphor', type: 'int', min: 0, max: 3, step: 1, value: 0, tooltip: 'CRT Phosphor type (0:P1 Green, 1:P31 Cyan, 2:P7 Amber, 3:P4 B&W)' },
      { name: 'mix', label: 'Wet Mix', type: 'float', min: 0.0, max: 1.0, step: 0.05, value: 0.85, tooltip: 'Wet / dry blend amount' },
    ],
  },
  create: () => new ScanimateFilter(),
};
