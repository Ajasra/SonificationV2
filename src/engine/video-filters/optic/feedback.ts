import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp, clampByte } from '../util.ts';

// 11. Nam June Paik / Steina Vasulka Optical Video Feedback & Resonator
// Simulates pointing a video camera at its own monitor with infinite recursive
// geometric transformations (zoom, precession rotation, temporal decay, and hue shift).
export class FeedbackFilter extends BaseVideoFilter {
  feedback = 0.65;   // 0.0 to 0.95 (feedback loop gain)
  zoom = 1.03;       // 0.90 to 1.15 (scale factor per generation)
  rotation = 1.5;    // -10 to 10 (degrees rotation per loop)
  decay = 0.96;      // 0.80 to 1.0 (temporal decay/damping)
  colorShift = 8;    // 0 to 45 (degrees hue rotation per generation)

  private feedbackBuffer: Uint8ClampedArray = new Uint8ClampedArray(0);

  init(width: number, height: number): void {
    super.init(width, height);
    const size = width * height * 4;
    if (this.feedbackBuffer.length !== size) {
      this.feedbackBuffer = new Uint8ClampedArray(size);
    }
  }

  randomize(): void {
    this.feedback = +(0.4 + Math.random() * 0.5).toFixed(2);
    this.zoom = +(0.95 + Math.random() * 0.15).toFixed(2);
    this.rotation = +(-5 + Math.random() * 10).toFixed(1);
    this.decay = +(0.88 + Math.random() * 0.11).toFixed(2);
    this.colorShift = Math.round(Math.random() * 30);
  }

  setParams(p: Record<string, number>): void {
    if (p.feedback !== undefined) this.feedback = clamp(p.feedback, 0.0, 0.95);
    if (p.zoom !== undefined) this.zoom = clamp(p.zoom, 0.90, 1.15);
    if (p.rotation !== undefined) this.rotation = clamp(p.rotation, -10, 10);
    if (p.decay !== undefined) this.decay = clamp(p.decay, 0.80, 1.0);
    if (p.colorShift !== undefined) this.colorShift = clamp(Math.round(p.colorShift), 0, 45);
  }

  getParams(): Record<string, number> {
    return {
      feedback: this.feedback,
      zoom: this.zoom,
      rotation: this.rotation,
      decay: this.decay,
      colorShift: this.colorShift,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height } = ctx;
    const size = width * height * 4;

    if (this.feedbackBuffer.length !== size) {
      this.init(width, height);
    }

    const buf = this.feedbackBuffer;
    const fbGain = this.feedback;
    const dcy = this.decay;
    let zm = this.zoom;
    let rot = this.rotation;

    // Cross-modulation: audio peaks create vortex bursts
    if (ctx.audioPeak && ctx.audioPeak > 0.05) {
      zm += (ctx.audioPeak - 0.05) * 0.08;
      rot += (ctx.audioPeak - 0.05) * 4.0;
    }

    const cx = width * 0.5;
    const cy = height * 0.5;
    const rad = (rot * Math.PI) / 180.0;
    const cosR = Math.cos(rad) / zm;
    const sinR = Math.sin(rad) / zm;

    // Color shift phase
    const cRad = (this.colorShift * Math.PI) / 180.0;
    const cosC = Math.cos(cRad);
    const sinC = Math.sin(cRad);

    const invFb = 1.0 - fbGain;

    for (let y = 0; y < height; y++) {
      const dy = y - cy;
      const yOffset = y * width * 4;

      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const i = yOffset + x * 4;

        // Inverse transform to find source coordinate in feedback buffer
        const srcX = Math.round(cx + dx * cosR - dy * sinR);
        const srcY = Math.round(cy + dx * sinR + dy * cosR);

        let fbR = 0, fbG = 0, fbB = 0;

        if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
          const srcIdx = (srcY * width + srcX) * 4;
          const origFbR = buf[srcIdx] * dcy;
          const origFbG = buf[srcIdx + 1] * dcy;
          const origFbB = buf[srcIdx + 2] * dcy;

          // Subtle hue precession rotation across channels
          fbR = origFbR * cosC - origFbG * sinC;
          fbG = origFbR * sinC + origFbG * cosC;
          fbB = origFbB;
        }

        const inR = rgba[i];
        const inG = rgba[i + 1];
        const inB = rgba[i + 2];

        // Combine live incoming video with decayed feedback
        const outR = clampByte(inR * invFb + fbR * fbGain);
        const outG = clampByte(inG * invFb + fbG * fbGain);
        const outB = clampByte(inB * invFb + fbB * fbGain);

        rgba[i] = outR;
        rgba[i + 1] = outG;
        rgba[i + 2] = outB;

        // Store back into feedback loop
        buf[i] = outR;
        buf[i + 1] = outG;
        buf[i + 2] = outB;
      }
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'feedback',
    name: 'Video Feedback Resonator',
    category: 'optic',
    description: 'Nam June Paik camera-monitor optical feedback loop with recursive zoom, precession rotation, and audio pulse.',
    params: [
      { name: 'feedback', label: 'Loop Gain', type: 'float', min: 0.0, max: 0.95, step: 0.02, value: 0.65, tooltip: 'Recursive optical feedback intensity' },
      { name: 'zoom', label: 'Vortex Zoom', type: 'float', min: 0.90, max: 1.15, step: 0.01, value: 1.03, tooltip: 'Spatial scale magnification per generation' },
      { name: 'rotation', label: 'Precession Angle', type: 'float', min: -10, max: 10, step: 0.2, value: 1.5, tooltip: 'Spiral precession rotation angle per generation' },
      { name: 'decay', label: 'Decay Damping', type: 'float', min: 0.80, max: 1.0, step: 0.01, value: 0.96, tooltip: 'Temporal persistence and luminance damping' },
      { name: 'colorShift', label: 'Chroma Precess', type: 'float', min: 0, max: 45, step: 1, value: 8, tooltip: 'Hue phase shift angle per loop generation' },
    ],
  },
  create: () => new FeedbackFilter(),
};
