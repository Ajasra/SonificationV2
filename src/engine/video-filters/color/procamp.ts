import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp } from '../util.ts';

// 9. Sony BVP-4 / Harris Broadcast Proc Amp & Pedestal Calibrator
// Hardware analog processing amplifier providing studio-grade black pedestal setup,
// luminance video gain, 360-degree chroma phase rotation, and diode white clipping.
export class ProcAmpFilter extends BaseVideoFilter {
  pedestal = 0;       // -50 to 50 (IRE black level setup offset)
  videoGain = 1.0;    // 0.2 to 3.0 (luminance contrast/amplifier)
  saturation = 1.1;   // 0.0 to 2.5 (chroma amplitude)
  chromaPhase = 0;    // -180 to 180 (subcarrier hue phase rotation in degrees)
  whiteClip = 240;    // 128 to 255 (broadcast diode peak white limiter)

  randomize(): void {
    this.pedestal = Math.round(-25 + Math.random() * 50);
    this.videoGain = +(0.7 + Math.random() * 1.5).toFixed(2);
    this.saturation = +(0.5 + Math.random() * 1.5).toFixed(2);
    this.chromaPhase = Math.round(-180 + Math.random() * 360);
    this.whiteClip = Math.round(200 + Math.random() * 55);
  }

  setParams(p: Record<string, number>): void {
    if (p.pedestal !== undefined) this.pedestal = clamp(p.pedestal, -50, 50);
    if (p.videoGain !== undefined) this.videoGain = clamp(p.videoGain, 0.2, 3.0);
    if (p.saturation !== undefined) this.saturation = clamp(p.saturation, 0.0, 2.5);
    if (p.chromaPhase !== undefined) this.chromaPhase = clamp(p.chromaPhase, -180, 180);
    if (p.whiteClip !== undefined) this.whiteClip = clamp(p.whiteClip, 128, 255);
  }

  getParams(): Record<string, number> {
    return {
      pedestal: this.pedestal,
      videoGain: this.videoGain,
      saturation: this.saturation,
      chromaPhase: this.chromaPhase,
      whiteClip: this.whiteClip,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const len = rgba.length;
    const ped = this.pedestal;
    let gain = this.videoGain;
    const sat = this.saturation;
    const clip = this.whiteClip;

    // Cross-modulation: audio peaks provide dynamic broadcast video gain pumping
    if (ctx.audioPeak && ctx.audioPeak > 0.05) {
      gain += ctx.audioPeak * 0.4;
    }

    const rad = (this.chromaPhase * Math.PI) / 180.0;
    const cosPhase = Math.cos(rad) * sat;
    const sinPhase = Math.sin(rad) * sat;

    // Fused BT.601 matrix * chroma phase rotation * inverse BT.601
    const u_r = -0.14713, u_g = -0.28886, u_b = 0.436;
    const v_r = 0.615, v_g = -0.51499, v_b = -0.10001;

    const newU_r = u_r * cosPhase - v_r * sinPhase;
    const newU_g = u_g * cosPhase - v_g * sinPhase;
    const newU_b = u_b * cosPhase - v_b * sinPhase;

    const newV_r = u_r * sinPhase + v_r * cosPhase;
    const newV_g = u_g * sinPhase + v_r * cosPhase;
    const newV_b = u_b * sinPhase + v_r * cosPhase;

    const dR_r = 1.13983 * newV_r;
    const dR_g = 1.13983 * newV_g;
    const dR_b = 1.13983 * newV_b;

    const dG_r = -0.39465 * newU_r - 0.58060 * newV_r;
    const dG_g = -0.39465 * newU_g - 0.58060 * newV_g;
    const dG_b = -0.39465 * newU_b - 0.58060 * newV_b;

    const dB_r = 2.03211 * newU_r;
    const dB_g = 2.03211 * newU_g;
    const dB_b = 2.03211 * newU_b;

    for (let i = 0; i < len; i += 4) {
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];

      // Convert RGB to YUV (BT.601) luminance
      const y = 0.299 * r + 0.587 * g + 0.114 * b;

      // Apply video gain and pedestal to luminance
      let newY = (y - 16) * gain + 16 + ped;
      if (newY > clip) newY = clip;
      else if (newY < 0) newY = 0;

      const outR = (newY + r * dR_r + g * dR_g + b * dR_b + 0.5) | 0;
      const outG = (newY + r * dG_r + g * dG_g + b * dG_b + 0.5) | 0;
      const outB = (newY + r * dB_r + g * dB_g + b * dB_b + 0.5) | 0;

      rgba[i] = outR < 0 ? 0 : outR > 255 ? 255 : outR;
      rgba[i + 1] = outG < 0 ? 0 : outG > 255 ? 255 : outG;
      rgba[i + 2] = outB < 0 ? 0 : outB > 255 ? 255 : outB;
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'procamp',
    name: 'Broadcast Proc Amp',
    category: 'color',
    description: 'Sony BVP-4 broadcast processing amplifier with pedestal setup, video gain, chroma phase, and diode white clip.',
    params: [
      { name: 'pedestal', label: 'Pedestal', type: 'int', min: -50, max: 50, step: 1, value: 0, tooltip: 'Black level DC setup offset (-50 to +50 IRE)' },
      { name: 'videoGain', label: 'Video Gain', type: 'float', min: 0.2, max: 3.0, step: 0.05, value: 1.0, tooltip: 'Luminance contrast and video amplifier level' },
      { name: 'saturation', label: 'Chroma Sat', type: 'float', min: 0.0, max: 2.5, step: 0.05, value: 1.1, tooltip: 'Subcarrier color saturation level' },
      { name: 'chromaPhase', label: 'Chroma Phase', type: 'float', min: -180, max: 180, step: 1, value: 0, tooltip: '360° subcarrier hue phase rotation' },
      { name: 'whiteClip', label: 'White Clip', type: 'int', min: 128, max: 255, step: 1, value: 240, tooltip: 'Broadcast diode peak white limiter' },
    ],
  },
  create: () => new ProcAmpFilter(),
};
