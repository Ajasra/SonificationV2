// Unified Pipeline Runner: Coordinates Color Transform -> Stream Encode -> DSP Chain -> Stream Decode -> Color Revert -> Equalize -> Blend
import type { SonificationPreset, BlendMode } from '../types/index.ts';
import { convertToColorSpace, convertFromColorSpace } from './colorspaces.ts';
import { imageToAudioStream, audioStreamToImage } from './streams.ts';
import { equalizeHistogram } from './equalizer.ts';
import { createFilterInstance } from './filters/factory.ts';
import type { IDspFilter } from './filters/base.ts';

export interface PipelineResult {
  outputRgba: Uint8ClampedArray;
  audioSamples: Float32Array;
  executionTimeMs: number;
}

export class SonificationPipeline {
  private activeFilters: IDspFilter[] = [];
  private currentFilterStateKey = '';

  // Preallocated working buffers
  private workRgbaBuffer = new Uint8ClampedArray(0);
  private workAudioBuffer = new Float32Array(0);

  private ensureBuffers(numPixels: number): void {
    const rgbaBytes = numPixels * 4;
    const audioSamples = numPixels * 3;

    if (this.workRgbaBuffer.length < rgbaBytes) {
      this.workRgbaBuffer = new Uint8ClampedArray(rgbaBytes);
    }
    if (this.workAudioBuffer.length < audioSamples) {
      this.workAudioBuffer = new Float32Array(audioSamples);
    }
  }

  private syncFilterInstances(preset: SonificationPreset): void {
    const key = preset.filters
      .map((f) => `${f.id}:${f.type}:${f.enabled}:${f.sampleRate}`)
      .join('|');

    if (this.currentFilterStateKey !== key) {
      this.activeFilters = preset.filters
        .filter((f) => f.enabled)
        .map((f) => {
          const instance = createFilterInstance(f.type, f.sampleRate);
          instance.setParams(f.params);
          return instance;
        });
      this.currentFilterStateKey = key;
    } else {
      // Update parameters in-place
      let activeIdx = 0;
      for (const f of preset.filters) {
        if (f.enabled && this.activeFilters[activeIdx]) {
          this.activeFilters[activeIdx].setParams(f.params);
          activeIdx++;
        }
      }
    }
  }

  processFrame(
    inputRgba: Uint8ClampedArray,
    width: number,
    height: number,
    preset: SonificationPreset,
    outputTargetRgba?: Uint8ClampedArray
  ): PipelineResult {
    const t0 = performance.now();
    const numPixels = width * height;
    this.ensureBuffers(numPixels);

    const outRgba = outputTargetRgba || new Uint8ClampedArray(numPixels * 4);

    // 1. Copy input into working buffer
    this.workRgbaBuffer.set(inputRgba.subarray(0, numPixels * 4));

    // 2. Pre-process color space transform
    convertToColorSpace(this.workRgbaBuffer.subarray(0, numPixels * 4), preset.reader.colorSpace);

    // 3. Encode image pixels into 1D audio sample stream [-1.0, 1.0]
    const numSamples = Math.floor((numPixels * 3) / (preset.reader.bits === 8 ? 1 : preset.reader.bits === 16 ? 2 : 3));
    const audioStream = imageToAudioStream(
      this.workRgbaBuffer.subarray(0, numPixels * 4),
      preset.reader,
      this.workAudioBuffer.subarray(0, numSamples)
    );

    // 4. Run audio DSP chain in-place with L1/L2 cache chunk fusion
    this.syncFilterInstances(preset);
    const numFilters = this.activeFilters.length;
    if (numFilters === 1) {
      this.activeFilters[0].processBlock(audioStream);
    } else if (numFilters > 1) {
      const CHUNK_SIZE = 16384; // 64 KB cache tile
      const totalLen = audioStream.length;
      for (let offset = 0; offset < totalLen; offset += CHUNK_SIZE) {
        const end = Math.min(offset + CHUNK_SIZE, totalLen);
        const chunk = audioStream.subarray(offset, end);
        for (let f = 0; f < numFilters; f++) {
          this.activeFilters[f].processBlock(chunk);
        }
      }
    }

    // 5. Decode 1D audio sample stream back into image pixels
    audioStreamToImage(audioStream, preset.writer, outRgba);

    // 6. Post-process color space transform revert
    convertFromColorSpace(outRgba, preset.writer.colorSpace);

    // 7. Histogram equalization & dynamic range normalization
    if (preset.equalize) {
      equalizeHistogram(outRgba);
    }

    // 8. Blend with original input if configured
    if (preset.blendMode !== 'NONE' && preset.blendAmount > 0) {
      this.blend(inputRgba, outRgba, preset.blendMode, preset.blendAmount);
    }

    const t1 = performance.now();

    return {
      outputRgba: outRgba,
      audioSamples: audioStream,
      executionTimeMs: t1 - t0,
    };
  }

  private blend(orig: Uint8ClampedArray, dest: Uint8ClampedArray, mode: BlendMode, amt: number): void {
    const len = dest.length;
    const invAmt = 1.0 - amt;

    for (let i = 0; i < len; i += 4) {
      const rA = orig[i];
      const gA = orig[i + 1];
      const bA = orig[i + 2];

      const rB = dest[i];
      const gB = dest[i + 1];
      const bB = dest[i + 2];

      let rBlended = rB;
      let gBlended = gB;
      let bBlended = bB;

      switch (mode) {
        case 'OVERLAY': {
          rBlended = rA < 128 ? (2 * rA * rB) / 255 : 255 - (2 * (255 - rA) * (255 - rB)) / 255;
          gBlended = gA < 128 ? (2 * gA * gB) / 255 : 255 - (2 * (255 - gA) * (255 - gB)) / 255;
          bBlended = bA < 128 ? (2 * bA * bB) / 255 : 255 - (2 * (255 - bA) * (255 - bB)) / 255;
          break;
        }
        case 'SCREEN': {
          rBlended = 255 - ((255 - rA) * (255 - rB)) / 255;
          gBlended = 255 - ((255 - gA) * (255 - gB)) / 255;
          bBlended = 255 - ((255 - bA) * (255 - bB)) / 255;
          break;
        }
        case 'MULTIPLY': {
          rBlended = (rA * rB) / 255;
          gBlended = (gA * gB) / 255;
          bBlended = (bA * bB) / 255;
          break;
        }
        case 'DIFFERENCE': {
          rBlended = Math.abs(rA - rB);
          gBlended = Math.abs(gA - gB);
          bBlended = Math.abs(bA - bB);
          break;
        }
        case 'ADD': {
          rBlended = Math.min(255, rA + rB);
          gBlended = Math.min(255, gA + gB);
          bBlended = Math.min(255, bA + bB);
          break;
        }
        case 'EXCLUSION': {
          rBlended = rA + rB - (2 * rA * rB) / 255;
          gBlended = gA + gB - (2 * gA * gB) / 255;
          bBlended = bA + bB - (2 * bA * bB) / 255;
          break;
        }
      }

      dest[i] = Math.round(rB * invAmt + rBlended * amt);
      dest[i + 1] = Math.round(gB * invAmt + gBlended * amt);
      dest[i + 2] = Math.round(bB * invAmt + bBlended * amt);
    }
  }
}
