import type { VideoFilterModule } from '../descriptor.ts';
import { BaseVideoFilter } from '../base.ts';
import type { VideoFrameContext } from '../../../types/index.ts';
import { clamp } from '../util.ts';

// 1. TBC Sync Stripper & Scanline Skew (Broken Time Base Corrector / VCR Sync Loss)
// Simulates loss of horizontal (H) and vertical (V) sync pulses:
// horizontal line tearing, vertical frame roll, high-frequency line jitter,
// and bottom-margin tape head-switching noise band.
export class SyncGlitchFilter extends BaseVideoFilter {
  hSkew = 15;        // 0 to 80 (horizontal sinusoidal & pulse line offset)
  vRoll = 0.0;       // 0 to 1 (vertical frame slip / continuous roll)
  jitter = 4;        // 0 to 30 (random scanline micro-jitter)
  headSwitch = 10;   // 0 to 40 (bottom head switching noise lines)

  private lineBuffer = new Uint32Array(1920);
  private rollBuffer = new Uint32Array(0);

  init(width: number, height: number): void {
    super.init(width, height);
    if (this.lineBuffer.length < width) {
      this.lineBuffer = new Uint32Array(width);
    }
    if (this.rollBuffer.length < width * height) {
      this.rollBuffer = new Uint32Array(width * height);
    }
  }

  randomize(): void {
    this.hSkew = Math.round(5 + Math.random() * 45);
    this.vRoll = Math.random() > 0.6 ? +(Math.random() * 0.4).toFixed(2) : 0;
    this.jitter = Math.round(Math.random() * 15);
    this.headSwitch = Math.round(4 + Math.random() * 18);
  }

  setParams(p: Record<string, number>): void {
    if (p.hSkew !== undefined) this.hSkew = clamp(p.hSkew, 0, 80);
    if (p.vRoll !== undefined) this.vRoll = clamp(p.vRoll, 0, 1);
    if (p.jitter !== undefined) this.jitter = clamp(p.jitter, 0, 30);
    if (p.headSwitch !== undefined) this.headSwitch = clamp(Math.round(p.headSwitch), 0, 40);
  }

  getParams(): Record<string, number> {
    return {
      hSkew: this.hSkew,
      vRoll: this.vRoll,
      jitter: this.jitter,
      headSwitch: this.headSwitch,
    };
  }

  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void {
    const { width, height, timeMs } = ctx;
    if (width <= 0 || height <= 0) return;
    if (this.lineBuffer.length < width) {
      this.lineBuffer = new Uint32Array(width);
    }

    // View as 32-bit pixel integers (RGBA packed in 4 bytes)
    const pixels = new Uint32Array(rgba.buffer, rgba.byteOffset, width * height);
    const lineBuf = this.lineBuffer;

    const skewAmp = this.hSkew;
    const jitterAmp = this.jitter;
    const headSwitchLines = this.headSwitch;
    const t = timeMs * 0.003;

    // Optional audio cross-modulation: higher audio RMS widens skew
    const audioBoost = ctx.audioRms ? (1 + ctx.audioRms * 2.5) : 1;
    const effectiveSkew = skewAmp * audioBoost;

    // 1. Handle Vertical Roll if active
    if (this.vRoll > 0.001) {
      const rollLines = Math.floor(this.vRoll * height) % height;
      if (rollLines > 0) {
        if (this.rollBuffer.length < pixels.length) {
          this.rollBuffer = new Uint32Array(pixels.length);
        }
        this.rollBuffer.set(pixels);
        const tempFull = this.rollBuffer;
        for (let y = 0; y < height; y++) {
          const srcY = (y + rollLines) % height;
          pixels.set(tempFull.subarray(srcY * width, (srcY + 1) * width), y * width);
        }
      }
    }

    // 2. Scanline-by-scanline Horizontal Tearing & Jitter
    for (let y = 0; y < height; y++) {
      // Is this line in the bottom head-switching zone?
      const isHeadSwitch = headSwitchLines > 0 && y >= (height - headSwitchLines);

      let shift = 0;
      if (effectiveSkew > 0) {
        // Multi-frequency sinusoidal tear + periodic sync pulse drop
        const wave = Math.sin(y * 0.08 + t) + Math.cos(y * 0.02 - t * 0.7) * 0.5;
        shift += Math.round(wave * effectiveSkew);
      }

      if (jitterAmp > 0) {
        // High frequency pseudo-random jitter per line
        const noise = ((Math.sin(y * 12.9898 + (timeMs & 0x3ff)) * 43758.5453) % 1);
        shift += Math.round(noise * jitterAmp);
      }

      if (isHeadSwitch) {
        // Heavy diagonal displacement + noise burst typical of VCR drum switch
        const hsDist = height - y;
        shift += Math.round((headSwitchLines - hsDist) * 3 + (Math.random() - 0.5) * 20);
      }

      if (shift === 0) continue;

      // Copy current scanline into line buffer
      const lineOffset = y * width;
      for (let x = 0; x < width; x++) {
        lineBuf[x] = pixels[lineOffset + x];
      }

      // Re-map shifted scanline with clamp
      for (let x = 0; x < width; x++) {
        let srcX = x - shift;
        if (srcX < 0) srcX = 0;
        else if (srcX >= width) srcX = width - 1;

        if (isHeadSwitch && Math.random() < 0.25) {
          // Head switch noise speckle (snow / salt-and-pepper)
          pixels[lineOffset + x] = Math.random() > 0.5 ? 0xffffffff : 0xff101010;
        } else {
          pixels[lineOffset + x] = lineBuf[srcX];
        }
      }
    }
  }
}

export const filter: VideoFilterModule = {
  descriptor: {
    id: 'syncglitch',
    name: 'TBC Sync Stripper',
    category: 'sync',
    description: 'Loss of H/V sync pulses: scanline horizontal tearing, vertical roll, jitter, and head-switch noise.',
    params: [
      { name: 'hSkew', label: 'H-Skew', type: 'float', min: 0, max: 80, step: 1, value: 15, tooltip: 'Horizontal wave scanline displacement and tearing' },
      { name: 'vRoll', label: 'V-Roll', type: 'float', min: 0, max: 1, step: 0.02, value: 0.0, tooltip: 'Vertical frame roll and vertical hold slip' },
      { name: 'jitter', label: 'Jitter', type: 'float', min: 0, max: 30, step: 1, value: 4, tooltip: 'High frequency line-by-line micro jitter' },
      { name: 'headSwitch', label: 'Head Switch', type: 'int', min: 0, max: 40, step: 1, value: 10, tooltip: 'VCR bottom tape head switching noise band' },
    ],
  },
  create: () => new SyncGlitchFilter(),
};
