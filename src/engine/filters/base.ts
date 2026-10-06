// Base interface and abstract class for all audio DSP filter nodes
// Designed for block-based, zero-allocation sample processing

export interface IDspFilter {
  sampleRate: number;
  init(): void;
  randomize(): void;
  setParams(params: Record<string, number>): void;
  getParams(): Record<string, number>;
  processBlock(samples: Float32Array): void;
}

export abstract class BaseDspFilter implements IDspFilter {
  sampleRate: number;
  protected invSampleRate: number;

  constructor(sampleRate: number = 44100) {
    this.sampleRate = sampleRate;
    this.invSampleRate = 1.0 / sampleRate;
  }

  setSampleRate(rate: number): void {
    this.sampleRate = rate;
    this.invSampleRate = 1.0 / rate;
    this.init();
  }

  abstract init(): void;
  abstract randomize(): void;
  abstract setParams(params: Record<string, number>): void;
  abstract getParams(): Record<string, number>;
  abstract processBlock(samples: Float32Array): void;
}
