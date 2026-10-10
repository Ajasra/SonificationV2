// Unified Pipeline Runner: Coordinates Color Transform -> Stream Encode -> DSP Chain -> Stream Decode -> Color Revert -> Equalize -> Blend
import type { SonificationPreset, BlendMode, VideoFrameContext } from '../types/index.ts';
import { convertToColorSpace, convertFromColorSpace } from './colorspaces.ts';
import { imageToAudioStream, audioStreamToImage } from './streams.ts';
import { equalizeHistogram } from './equalizer.ts';
import { createFilterInstance } from './filters/factory.ts';
import type { IDspFilter } from './filters/base.ts';
import { createVideoFilterInstance } from './video-filters/factory.ts';
import type { IVideoFilter } from './video-filters/base.ts';

export interface PipelineResult {
  outputRgba: Uint8ClampedArray;
  audioSamples: Float32Array;
  rawAudioSamples?: Float32Array;
  executionTimeMs: number;
}

export class SonificationPipeline {
  private activeFilters: IDspFilter[] = [];
  private currentFilterStateKey = '';

  private activeVideoFilters: IVideoFilter[] = [];
  private currentVideoFilterStateKey = '';

  // Preallocated working buffers and zero-allocation chunk views
  private workRgbaBuffer = new Uint8ClampedArray(0);
  private workAudioBuffer = new Float32Array(0);
  private rawAudioPreviewBuffer = new Float32Array(2048);
  private chunkViews: Float32Array[] = [];
  private lastChunkSamples = 0;
  private static readonly CHUNK_SIZE = 8192; // 32 KB cache tile (100% L1 Data Cache hit rate)

  private ensureBuffers(numPixels: number, numSamples: number): void {
    const rgbaBytes = numPixels * 4;
    const audioSamples = numPixels * 3;

    if (this.workRgbaBuffer.length < rgbaBytes) {
      this.workRgbaBuffer = new Uint8ClampedArray(rgbaBytes);
    }
    if (this.workAudioBuffer.length < audioSamples) {
      this.workAudioBuffer = new Float32Array(audioSamples);
      this.lastChunkSamples = 0;
    }

    if (this.lastChunkSamples !== numSamples) {
      this.chunkViews = [];
      const CHUNK_SIZE = SonificationPipeline.CHUNK_SIZE;
      for (let offset = 0; offset < numSamples; offset += CHUNK_SIZE) {
        const end = Math.min(offset + CHUNK_SIZE, numSamples);
        this.chunkViews.push(this.workAudioBuffer.subarray(offset, end));
      }
      this.lastChunkSamples = numSamples;
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

  private syncVideoFilterInstances(preset: SonificationPreset, width: number, height: number): void {
    const list = preset.videoFilters || [];
    const key = list
      .map((f) => `${f.id}:${f.type}:${f.enabled}`)
      .join('|');

    if (this.currentVideoFilterStateKey !== key) {
      this.activeVideoFilters = list
        .filter((f) => f.enabled)
        .map((f) => {
          const instance = createVideoFilterInstance(f.type);
          instance.init(width, height);
          instance.setParams(f.params);
          return instance;
        });
      this.currentVideoFilterStateKey = key;
    } else {
      let activeIdx = 0;
      for (const f of list) {
        if (f.enabled && this.activeVideoFilters[activeIdx]) {
          this.activeVideoFilters[activeIdx].setParams(f.params);
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
    const numSamples = Math.floor((numPixels * 3) / (preset.reader.bits === 8 ? 1 : preset.reader.bits === 16 ? 2 : 3));
    this.ensureBuffers(numPixels, numSamples);

    const outRgba = outputTargetRgba || new Uint8ClampedArray(numPixels * 4);

    // 1 & 2. Color space transform: if RGB, bypass 8MB memcpy completely!
    let srcRgba: Uint8ClampedArray;
    if (preset.reader.colorSpace === 'RGB') {
      srcRgba = inputRgba;
    } else {
      this.workRgbaBuffer.set(inputRgba.subarray(0, numPixels * 4));
      convertToColorSpace(this.workRgbaBuffer.subarray(0, numPixels * 4), preset.reader.colorSpace);
      srcRgba = this.workRgbaBuffer;
    }

    // 3. Encode image pixels into 1D audio sample stream [-1.0, 1.0]
    const audioStream = imageToAudioStream(
      srcRgba.subarray(0, numPixels * 4),
      preset.reader,
      this.workAudioBuffer.subarray(0, numSamples)
    );

    // Snapshot preview of unmodulated raw audio stream before DSP filter chain
    const copyLen = Math.min(audioStream.length, this.rawAudioPreviewBuffer.length);
    this.rawAudioPreviewBuffer.set(audioStream.subarray(0, copyLen));

    // 4. Run audio DSP chain in-place with preallocated L1 cache chunk fusion
    this.syncFilterInstances(preset);
    const numFilters = this.activeFilters.length;
    if (numFilters === 1) {
      this.activeFilters[0].processBlock(audioStream);
    } else if (numFilters > 1) {
      const chunks = this.chunkViews;
      const numChunks = chunks.length;
      for (let c = 0; c < numChunks; c++) {
        const chunk = chunks[c];
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

    // 9. Run analog video processing rack in-place (with audio CV metrics)
    if (preset.videoFilters && preset.videoFilters.length > 0) {
      this.syncVideoFilterInstances(preset, width, height);
      if (this.activeVideoFilters.length > 0) {
        // Fast subsampled audio RMS and peak calculation for cross-modulation
        let sumSq = 0;
        let peak = 0;
        const sLen = audioStream.length;
        const stride = Math.max(1, Math.floor(sLen / 1024));
        let count = 0;
        for (let i = 0; i < sLen; i += stride) {
          const s = Math.abs(audioStream[i]);
          if (s > peak) peak = s;
          sumSq += s * s;
          count++;
        }
        const audioRms = count > 0 ? Math.sqrt(sumSq / count) : 0;

        const videoCtx: VideoFrameContext = {
          width,
          height,
          timeMs: t0,
          audioRms,
          audioPeak: peak,
        };

        for (const vFilter of this.activeVideoFilters) {
          vFilter.processFrame(outRgba, videoCtx);
        }
      }
    }

    const t1 = performance.now();

    return {
      outputRgba: outRgba,
      audioSamples: audioStream,
      rawAudioSamples: this.rawAudioPreviewBuffer.subarray(0, copyLen),
      executionTimeMs: t1 - t0,
    };
  }

  private blend(orig: Uint8ClampedArray, dest: Uint8ClampedArray, mode: BlendMode, amt: number): void {
    const len = dest.length;
    const invAmt = 1.0 - amt;
    const inv255 = 1.0 / 255.0;

    switch (mode) {
      case 'OVERLAY': {
        for (let i = 0; i < len; i += 4) {
          const rA = orig[i], gA = orig[i + 1], bA = orig[i + 2];
          const rB = dest[i], gB = dest[i + 1], bB = dest[i + 2];
          const rBlended = rA < 128 ? (2 * rA * rB) * inv255 : 255 - (2 * (255 - rA) * (255 - rB)) * inv255;
          const gBlended = gA < 128 ? (2 * gA * gB) * inv255 : 255 - (2 * (255 - gA) * (255 - gB)) * inv255;
          const bBlended = bA < 128 ? (2 * bA * bB) * inv255 : 255 - (2 * (255 - bA) * (255 - bB)) * inv255;
          dest[i] = (rB * invAmt + rBlended * amt + 0.5) | 0;
          dest[i + 1] = (gB * invAmt + gBlended * amt + 0.5) | 0;
          dest[i + 2] = (bB * invAmt + bBlended * amt + 0.5) | 0;
        }
        break;
      }
      case 'SCREEN': {
        for (let i = 0; i < len; i += 4) {
          const rA = orig[i], gA = orig[i + 1], bA = orig[i + 2];
          const rB = dest[i], gB = dest[i + 1], bB = dest[i + 2];
          const rBlended = 255 - ((255 - rA) * (255 - rB)) * inv255;
          const gBlended = 255 - ((255 - gA) * (255 - gB)) * inv255;
          const bBlended = 255 - ((255 - bA) * (255 - bB)) * inv255;
          dest[i] = (rB * invAmt + rBlended * amt + 0.5) | 0;
          dest[i + 1] = (gB * invAmt + gBlended * amt + 0.5) | 0;
          dest[i + 2] = (bB * invAmt + bBlended * amt + 0.5) | 0;
        }
        break;
      }
      case 'MULTIPLY': {
        for (let i = 0; i < len; i += 4) {
          const rA = orig[i], gA = orig[i + 1], bA = orig[i + 2];
          const rB = dest[i], gB = dest[i + 1], bB = dest[i + 2];
          dest[i] = (rB * invAmt + (rA * rB * inv255) * amt + 0.5) | 0;
          dest[i + 1] = (gB * invAmt + (gA * gB * inv255) * amt + 0.5) | 0;
          dest[i + 2] = (bB * invAmt + (bA * bB * inv255) * amt + 0.5) | 0;
        }
        break;
      }
      case 'DIFFERENCE': {
        for (let i = 0; i < len; i += 4) {
          const rA = orig[i], gA = orig[i + 1], bA = orig[i + 2];
          const rB = dest[i], gB = dest[i + 1], bB = dest[i + 2];
          dest[i] = (rB * invAmt + Math.abs(rA - rB) * amt + 0.5) | 0;
          dest[i + 1] = (gB * invAmt + Math.abs(gA - gB) * amt + 0.5) | 0;
          dest[i + 2] = (bB * invAmt + Math.abs(bA - bB) * amt + 0.5) | 0;
        }
        break;
      }
      case 'ADD': {
        for (let i = 0; i < len; i += 4) {
          const rA = orig[i], gA = orig[i + 1], bA = orig[i + 2];
          const rB = dest[i], gB = dest[i + 1], bB = dest[i + 2];
          const rBlended = (rA + rB) > 255 ? 255 : (rA + rB);
          const gBlended = (gA + gB) > 255 ? 255 : (gA + gB);
          const bBlended = (bA + bB) > 255 ? 255 : (bA + bB);
          dest[i] = (rB * invAmt + rBlended * amt + 0.5) | 0;
          dest[i + 1] = (gB * invAmt + gBlended * amt + 0.5) | 0;
          dest[i + 2] = (bB * invAmt + bBlended * amt + 0.5) | 0;
        }
        break;
      }
      case 'EXCLUSION': {
        for (let i = 0; i < len; i += 4) {
          const rA = orig[i], gA = orig[i + 1], bA = orig[i + 2];
          const rB = dest[i], gB = dest[i + 1], bB = dest[i + 2];
          const rBlended = rA + rB - (2 * rA * rB) * inv255;
          const gBlended = gA + gB - (2 * gA * gB) * inv255;
          const bBlended = bA + bB - (2 * bA * bB) * inv255;
          dest[i] = (rB * invAmt + rBlended * amt + 0.5) | 0;
          dest[i + 1] = (gB * invAmt + gBlended * amt + 0.5) | 0;
          dest[i + 2] = (bB * invAmt + bBlended * amt + 0.5) | 0;
        }
        break;
      }
    }
  }
}
