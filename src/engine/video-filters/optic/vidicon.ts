import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp, clampByte } from '../util.ts';

// 8. Vidicon Tube Camera Lag & Phosphor Comet Trails
// Simulates photoconductive target plate charge decay in vintage vacuum tube television cameras.
// Bright moving subjects leave lingering, decaying comet trails with customizable phosphor tint.
export class VidiconFilter extends BaseVideoFilter {
  decay = 0.88;       // 0.5 to 0.98 (trail persistence retention per frame)
  threshold = 110;    // 30 to 220 (luminance knee where comet charge deposits)
  glowGain = 1.3;     // 0.5 to 2.5 (trail brilliance boost)
  tint = 1;           // 0: neutral, 1: phosphor chartreuse, 2: warm amber/copper

  private trailBuffer = new Float32Array(0);

  init(width: number, height: number): void {
    super.init(width, height);
    const sz = width * height * 3;
    if (this.trailBuffer.length !== sz) {
      this.trailBuffer = new Float32Array(sz);
    }
  }

  randomize(): void {
    this.decay = +(0.75 + Math.random() * 0.2).toFixed(2);
    this.threshold = Math.round(70 + Math.random() * 90);
    this.glowGain = +(0.8 + Math.random() * 1.0).toFixed(1);
    this.tint = Math.floor(Math.random() * 3);
  }

  setParams(p: Record<string, number>): void {
    if (p.decay !== undefined) this.decay = clamp(p.decay, 0.5, 0.98);
    if (p.threshold !== undefined) this.threshold = clamp(Math.round(p.threshold), 30, 220);
    if (p.glowGain !== undefined) this.glowGain = clamp(p.glowGain, 0.5, 2.5);
    if (p.tint !== undefined) this.tint = clamp(Math.round(p.tint), 0, 2);
  }

  getParams(): Record<string, number> {
    return {
      decay: this.decay,
      threshold: this.threshold,
      glowGain: this.glowGain,
      tint: this.tint,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height } = ctx;
    if (width <= 0 || height <= 0) return;

    const numPixels = width * height;
    const requiredSize = numPixels * 3;
    if (this.trailBuffer.length !== requiredSize) {
      this.trailBuffer = new Float32Array(requiredSize);
    }

    const trail = this.trailBuffer;
    const dFactor = this.decay;
    const thresh = this.threshold;
    const gain = this.glowGain;
    const tintMode = this.tint;

    // Tint weighting multipliers
    let tintR = 1.0, tintG = 1.0, tintB = 1.0;
    if (tintMode === 1) {
      // Cathode chartreuse phosphor (#c8d665)
      tintR = 0.78;
      tintG = 1.0;
      tintB = 0.40;
    } else if (tintMode === 2) {
      // Warm amber / copper trace (#d4a373)
      tintR = 1.0;
      tintG = 0.75;
      tintB = 0.45;
    }

    for (let i = 0; i < numPixels; i++) {
      const rgbaIdx = i * 4;
      const trailIdx = i * 3;

      const r = rgba[rgbaIdx];
      const g = rgba[rgbaIdx + 1];
      const b = rgba[rgbaIdx + 2];

      const luma = (r * 77 + g * 150 + b * 29) >> 8;

      // Decay previous trail charge
      let tR = trail[trailIdx] * dFactor;
      let tG = trail[trailIdx + 1] * dFactor;
      let tB = trail[trailIdx + 2] * dFactor;

      // Charge accumulation from highlights
      if (luma > thresh) {
        const excess = (luma - thresh) / 255.0;
        tR = Math.max(tR, r * excess * gain);
        tG = Math.max(tG, g * excess * gain);
        tB = Math.max(tB, b * excess * gain);
      }

      trail[trailIdx] = tR;
      trail[trailIdx + 1] = tG;
      trail[trailIdx + 2] = tB;

      // Additive phosphor trail overlay
      rgba[rgbaIdx] = clampByte(r + tR * tintR);
      rgba[rgbaIdx + 1] = clampByte(g + tG * tintG);
      rgba[rgbaIdx + 2] = clampByte(b + tB * tintB);
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'vidicon',
    name: 'Vidicon Comet Trails',
    category: 'optic',
    description: '1970s Vidicon camera tube lag: moving bright highlights leave lingering, glowing phosphor comet ghosts.',
    params: [
      { name: 'decay', label: 'Trail Decay', type: 'float', min: 0.5, max: 0.98, step: 0.02, value: 0.88, tooltip: 'Persistence retention factor of the decaying ghost trail' },
      { name: 'threshold', label: 'Charge Knee', type: 'int', min: 30, max: 220, step: 2, value: 110, tooltip: 'Minimum luminance required to deposit phosphor charge' },
      { name: 'glowGain', label: 'Ghost Gain', type: 'float', min: 0.5, max: 2.5, step: 0.1, value: 1.3, tooltip: 'Brilliance multiplier of the lingering comet' },
      { name: 'tint', label: 'Phosphor Tint', type: 'int', min: 0, max: 2, step: 1, value: 1, tooltip: 'Phosphor color (0: Neutral, 1: Chartreuse Green, 2: Warm Amber)' },
    ],
  },
  create: () => new VidiconFilter(),
};
