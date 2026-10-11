// Unified Pipeline Runner. The processing chain interleaves audio and video nodes in any order.
// Consecutive same-kind nodes form a segment:
//   audio segment: Color Transform -> Stream Encode -> fused DSP chain -> Stream Decode -> Color Revert
//   video segment: in-place RGBA filters
// Equalize and Blend run once, right after the last audio segment.
import type { SonificationPreset, BlendMode, VideoFrameContext } from '../types/index.ts';
import { convertToColorSpace, convertFromColorSpace } from './colorspaces.ts';
import { imageToAudioStream, audioStreamToImage } from './streams.ts';
import { equalizeHistogram } from './equalizer.ts';
import { createFilterInstance } from './filters/factory.ts';
import type { IDspFilter } from './filters/base.ts';
import { createVideoFilterInstance } from './video-filters/factory.ts';
import type { IVideoFilter } from './video-filters/base.ts';
import { resolveChain } from './chain.ts';

export interface PipelineResult {
  outputRgba: Uint8ClampedArray;
  audioSamples: Float32Array;
  rawAudioSamples?: Float32Array;
  executionTimeMs: number;
}

type Segment =
  | { kind: 'audio'; filters: IDspFilter[]; isLast: boolean }
  | { kind: 'video'; filters: IVideoFilter[] };

export class SonificationPipeline {
  // Compiled chain, rebuilt only when structure (order / type / enabled / size) changes
  private segments: Segment[] = [];
  private nodes: { inst: IDspFilter | IVideoFilter; cfgRef: { params: Record<string, number> } }[] = [];
  private chainKey = '';
  private hasVideo = false;
  // Instance cache keyed by node id: reordering or toggling keeps filter state alive
  private instanceCache = new Map<string, { sig: string; inst: IDspFilter | IVideoFilter }>();

  // Audio levels for video cross-modulation (previous frame if no audio ran yet)
  private lastAudioRms = 0;
  private lastAudioPeak = 0;

  // Preallocated working buffers and zero-allocation chunk views
  private workRgbaBuffer = new Uint8ClampedArray(0);
  private workAudioBuffer = new Float32Array(0);
  private rawAudioPreviewBuffer = new Float32Array(2048);
  private chunkViews: Float32Array[] = [];
  private lastChunkSamples = 0;
  private static readonly CHUNK_SIZE = 8192; // 32 KB cache tile (100% L1 Data Cache hit rate)

  // Fast chain memoization
  private cachedOrdered: ReturnType<typeof resolveChain> | null = null;
  private lastPresetRef: SonificationPreset | null = null;
  private lastChainRef: SonificationPreset['chain'] | null = null;
  private lastFiltersRef: SonificationPreset['filters'] | null = null;
  private lastVideoFiltersRef: SonificationPreset['videoFilters'] | null = null;

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

  /** Rebuild segments if the chain structure changed; otherwise push params in place. */
  private syncChain(preset: SonificationPreset, width: number, height: number): void {
    let ordered = this.cachedOrdered;
    if (
      !ordered ||
      preset !== this.lastPresetRef ||
      preset.chain !== this.lastChainRef ||
      preset.filters !== this.lastFiltersRef ||
      preset.videoFilters !== this.lastVideoFiltersRef
    ) {
      ordered = resolveChain(preset);
      this.cachedOrdered = ordered;
      this.lastPresetRef = preset;
      this.lastChainRef = preset.chain;
      this.lastFiltersRef = preset.filters;
      this.lastVideoFiltersRef = preset.videoFilters;
    }

    let key = `${width}x${height}`;
    for (let i = 0; i < ordered.length; i++) {
      const e = ordered[i];
      key += `|${e.kind}:${e.cfg.id}:${e.cfg.type}:${e.cfg.enabled}${e.kind === 'audio' ? ':' + e.cfg.sampleRate : ''}`;
    }

    if (key !== this.chainKey) {
      const nextCache = new Map<string, { sig: string; inst: IDspFilter | IVideoFilter }>();
      const segments: Segment[] = [];
      const nodes: { inst: IDspFilter | IVideoFilter; cfgRef: { params: Record<string, number> } }[] = [];
      let hasVideo = false;

      for (const e of ordered) {
        if (!e.cfg.enabled) continue;
        const sig = e.kind === 'audio' ? `a:${e.cfg.type}:${e.cfg.sampleRate}` : `v:${e.cfg.type}:${width}x${height}`;
        const cacheKey = `${e.kind}:${e.cfg.id}`;
        let entry = this.instanceCache.get(cacheKey);
        if (!entry || entry.sig !== sig) {
          let inst: IDspFilter | IVideoFilter;
          if (e.kind === 'audio') {
            inst = createFilterInstance(e.cfg.type, e.cfg.sampleRate);
          } else {
            const v = createVideoFilterInstance(e.cfg.type);
            v.init(width, height);
            inst = v;
          }
          entry = { sig, inst };
        }
        nextCache.set(cacheKey, entry);
        nodes.push({ inst: entry.inst, cfgRef: e.cfg });

        const last = segments[segments.length - 1];
        if (e.kind === 'audio') {
          if (last && last.kind === 'audio') last.filters.push(entry.inst as IDspFilter);
          else segments.push({ kind: 'audio', filters: [entry.inst as IDspFilter], isLast: false });
        } else {
          hasVideo = true;
          if (last && last.kind === 'video') last.filters.push(entry.inst as IVideoFilter);
          else segments.push({ kind: 'video', filters: [entry.inst as IVideoFilter] });
        }
      }

      // The stream stage always runs at least once (reader/writer reinterpretation + audio monitor)
      if (!segments.some((s) => s.kind === 'audio')) {
        segments.unshift({ kind: 'audio', filters: [], isLast: false });
      }
      for (let i = segments.length - 1; i >= 0; i--) {
        const s = segments[i];
        if (s.kind === 'audio') { s.isLast = true; break; }
      }

      this.segments = segments;
      this.nodes = nodes;
      this.hasVideo = hasVideo;
      this.instanceCache = nextCache;
      this.chainKey = key;
    }

    for (const n of this.nodes) n.inst.setParams(n.cfgRef.params);
  }

  /** Fast subsampled RMS / peak of the audio stream for video cross-modulation. */
  private measureAudio(stream: Float32Array): void {
    let sumSq = 0;
    let peak = 0;
    const sLen = stream.length;
    const stride = Math.max(1, Math.floor(sLen / 1024));
    let count = 0;
    for (let i = 0; i < sLen; i += stride) {
      const s = Math.abs(stream[i]);
      if (s > peak) peak = s;
      sumSq += s * s;
      count++;
    }
    this.lastAudioRms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    this.lastAudioPeak = peak;
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
    this.syncChain(preset, width, height);

    const outRgba = outputTargetRgba || new Uint8ClampedArray(numPixels * 4);

    // `cur` is the current image. It starts as the read-only input and moves to outRgba
    // the first time a stage writes.
    let cur: Uint8ClampedArray = inputRgba;
    let audioStream: Float32Array = this.workAudioBuffer.subarray(0, numSamples);
    let firstAudio = true;
    let copyLen = 0;

    for (const seg of this.segments) {
      if (seg.kind === 'video') {
        if (cur === inputRgba) {
          outRgba.set(inputRgba.subarray(0, numPixels * 4));
          cur = outRgba;
        }
        const videoCtx: VideoFrameContext = {
          width,
          height,
          timeMs: t0,
          audioRms: this.lastAudioRms,
          audioPeak: this.lastAudioPeak,
        };
        const fl = seg.filters;
        for (let i = 0; i < fl.length; i++) fl[i].processFrame(outRgba, videoCtx);
        continue;
      }

      // Audio segment. Color space transform: if RGB, bypass the 8MB memcpy completely!
      let srcRgba: Uint8ClampedArray;
      if (preset.reader.colorSpace === 'RGB') {
        srcRgba = cur;
      } else {
        this.workRgbaBuffer.set(cur.subarray(0, numPixels * 4));
        convertToColorSpace(this.workRgbaBuffer.subarray(0, numPixels * 4), preset.reader.colorSpace);
        srcRgba = this.workRgbaBuffer;
      }

      // Encode image pixels into 1D audio sample stream [-1.0, 1.0]
      audioStream = imageToAudioStream(
        srcRgba.subarray(0, numPixels * 4),
        preset.reader,
        this.workAudioBuffer.subarray(0, numSamples)
      );

      // Snapshot preview of the unmodulated stream before the first DSP segment
      if (firstAudio) {
        copyLen = Math.min(audioStream.length, this.rawAudioPreviewBuffer.length);
        this.rawAudioPreviewBuffer.set(audioStream.subarray(0, copyLen));
        firstAudio = false;
      }

      // Run audio DSP chain in-place with preallocated L1 cache chunk fusion
      const fl = seg.filters;
      const numFilters = fl.length;
      if (numFilters === 1) {
        fl[0].processBlock(audioStream);
      } else if (numFilters > 1) {
        const chunks = this.chunkViews;
        const numChunks = chunks.length;
        for (let c = 0; c < numChunks; c++) {
          const chunk = chunks[c];
          for (let f = 0; f < numFilters; f++) fl[f].processBlock(chunk);
        }
      }

      if (this.hasVideo) this.measureAudio(audioStream);

      // Decode the stream back into image pixels, then revert the color space
      audioStreamToImage(audioStream, preset.writer, outRgba);
      convertFromColorSpace(outRgba, preset.writer.colorSpace);
      cur = outRgba;

      // Equalize & blend belong to the final audio stage
      if (seg.isLast) {
        if (preset.equalize) equalizeHistogram(outRgba);
        if (preset.blendMode !== 'NONE' && preset.blendAmount > 0) {
          this.blend(inputRgba, outRgba, preset.blendMode, preset.blendAmount);
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
