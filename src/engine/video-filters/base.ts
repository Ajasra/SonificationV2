// Base interface and abstract class for all Analog Video filter nodes
// Designed for in-place, zero-allocation frame processing
import type { VideoFrameContext } from '../../types/index.ts';

export interface IVideoFilter {
  init(width: number, height: number): void;
  randomize(): void;
  setParams(params: Record<string, number>): void;
  getParams(): Record<string, number>;
  processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void;
}

export abstract class BaseVideoFilter implements IVideoFilter {
  protected lastWidth = 0;
  protected lastHeight = 0;

  init(width: number, height: number): void {
    this.lastWidth = width;
    this.lastHeight = height;
  }

  abstract randomize(): void;
  abstract setParams(params: Record<string, number>): void;
  abstract getParams(): Record<string, number>;
  abstract processFrame(rgba: Uint8ClampedArray, ctx: VideoFrameContext): void;
}
