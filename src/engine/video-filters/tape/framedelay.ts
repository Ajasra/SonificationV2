import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp } from '../util.ts';

// 14. Quantel DPE 5000 / Prime Image Temporal Frame Delay & Glitch Stutter
// Circular digital frame-store buffer providing multi-frame temporal delay echoes,
// motion decay ghosting, audio-triggered stutter, and freeze-frame memory latch.
export class FrameDelayFilter extends BaseVideoFilter {
  delayFrames = 6;    // 1 to 16 (temporal delay buffer depth in frames)
  echoMix = 0.5;      // 0.0 to 1.0 (delayed frame blend amount)
  decay = 0.85;       // 0.5 to 0.98 (trailing echo persistence)
  freeze = 0;         // 0 or 1 (frame freeze hold latch)
  stutter = 0.0;      // 0.0 to 1.0 (audio-reactive stutter / frame repeat chance)

  private static readonly MAX_BUFFER_FRAMES = 16;
  private ringBuffer: Uint8ClampedArray[] = [];
  private writeIdx = 0;
  private stutterHold = 0;

  init(width: number, height: number): void {
    super.init(width, height);
    const size = width * height * 4;
    this.ringBuffer = [];
    for (let f = 0; f < FrameDelayFilter.MAX_BUFFER_FRAMES; f++) {
      this.ringBuffer.push(new Uint8ClampedArray(size));
    }
    this.writeIdx = 0;
  }

  randomize(): void {
    this.delayFrames = Math.floor(2 + Math.random() * 12);
    this.echoMix = +(0.3 + Math.random() * 0.6).toFixed(2);
    this.decay = +(0.7 + Math.random() * 0.25).toFixed(2);
    this.stutter = +(Math.random() * 0.5).toFixed(2);
  }

  setParams(p: Record<string, number>): void {
    if (p.delayFrames !== undefined) this.delayFrames = clamp(Math.round(p.delayFrames), 1, 16);
    if (p.echoMix !== undefined) this.echoMix = clamp(p.echoMix, 0.0, 1.0);
    if (p.decay !== undefined) this.decay = clamp(p.decay, 0.5, 0.98);
    if (p.freeze !== undefined) this.freeze = clamp(Math.round(p.freeze), 0, 1);
    if (p.stutter !== undefined) this.stutter = clamp(p.stutter, 0.0, 1.0);
  }

  getParams(): Record<string, number> {
    return {
      delayFrames: this.delayFrames,
      echoMix: this.echoMix,
      decay: this.decay,
      freeze: this.freeze,
      stutter: this.stutter,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height } = ctx;
    const size = width * height * 4;

    if (this.ringBuffer.length !== FrameDelayFilter.MAX_BUFFER_FRAMES || this.ringBuffer[0]?.length !== size) {
      this.init(width, height);
    }

    const maxFrames = FrameDelayFilter.MAX_BUFFER_FRAMES;
    const depth = clamp(this.delayFrames, 1, maxFrames);
    const readIdx = (this.writeIdx - depth + maxFrames) % maxFrames;
    const delayedBuf = this.ringBuffer[readIdx];

    // Audio-reactive stutter check
    if (this.stutter > 0.05 && ctx.audioPeak && ctx.audioPeak > (1.0 - this.stutter * 0.6)) {
      this.stutterHold = 3;
    }

    const isFrozen = this.freeze === 1 || this.stutterHold > 0;
    if (this.stutterHold > 0) this.stutterHold--;

    const wet = this.echoMix;
    const dry = 1.0 - wet;
    const dcyWet = this.decay * wet;

    // Blend current frame with delayed frame buffer
    if (delayedBuf) {
      for (let i = 0; i < size; i += 4) {
        rgba[i] = (rgba[i] * dry + delayedBuf[i] * dcyWet + 0.5) | 0;
        rgba[i + 1] = (rgba[i + 1] * dry + delayedBuf[i + 1] * dcyWet + 0.5) | 0;
        rgba[i + 2] = (rgba[i + 2] * dry + delayedBuf[i + 2] * dcyWet + 0.5) | 0;
      }
    }

    // Only update ring buffer if not currently frozen
    if (!isFrozen) {
      this.ringBuffer[this.writeIdx].set(rgba);
      this.writeIdx = (this.writeIdx + 1) % maxFrames;
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'framedelay',
    name: 'Frame Delay & Stutter',
    category: 'tape',
    description: 'Quantel DPE digital frame buffer: multi-frame delay trails, decay ghosting, freeze-frame latch, and beat stutter.',
    params: [
      { name: 'delayFrames', label: 'Delay Depth', type: 'int', min: 1, max: 16, step: 1, value: 6, tooltip: 'Temporal buffer depth in frames (1 to 16)' },
      { name: 'echoMix', label: 'Echo Mix', type: 'float', min: 0.0, max: 1.0, step: 0.05, value: 0.50, tooltip: 'Wet mix blend of delayed frame signal' },
      { name: 'decay', label: 'Trail Decay', type: 'float', min: 0.5, max: 0.98, step: 0.02, value: 0.85, tooltip: 'Persistence and decay rate of trailing motion' },
      { name: 'freeze', label: 'Freeze Hold', type: 'bool', min: 0, max: 1, step: 1, value: 0, tooltip: 'Latch and hold the current frame indefinitely' },
      { name: 'stutter', label: 'Audio Stutter', type: 'float', min: 0.0, max: 1.0, step: 0.05, value: 0.0, tooltip: 'Audio peak triggered frame stutter repeat probability' },
    ],
  },
  create: () => new FrameDelayFilter(),
};
