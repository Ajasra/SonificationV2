// Unified Pipeline Runner. The processing chain interleaves audio and video nodes in any order.
// Consecutive same-kind nodes form a segment:
//   audio segment: Color Transform -> Stream Encode -> fused DSP chain -> Stream Decode -> Color Revert
//   video segment: in-place RGBA filters
// Equalize and Blend run once, right after the last audio segment.
import type { SonopticonPreset, BlendMode, VideoFrameContext } from '../types/index.ts';
import { convertToColorSpace, convertFromColorSpace } from './colorspaces.ts';
import { imageToAudioStream, audioStreamToImage } from './streams.ts';
import { equalizeHistogram } from './equalizer.ts';
import { createFilterInstance } from './filters/factory.ts';
import type { IDspFilter } from './filters/base.ts';
import { createVideoFilterInstance } from './video-filters/factory.ts';
import type { IVideoFilter } from './video-filters/base.ts';
import { resolveChain } from './chain.ts';
import { TapeSaturationFilter } from './filters/lofi/tapesat.ts';

export interface PipelineResult {
  outputRgba: Uint8ClampedArray;
  /** Borrowed working storage: copy samples before retaining across processFrame calls. */
  audioSamples: Float32Array;
  /** Borrowed preview storage with the same lifetime as audioSamples. */
  rawAudioSamples?: Float32Array;
  executionTimeMs: number;
  /** Opt-in instrumentation; total includes setup and timing overhead. */
  timings?: PipelineTimings;
  /** Present only for a split frame; valid until the next processing call. */
  prefix?: PipelinePrefixResult;
}

export interface PipelinePrefixResult {
  token: object;
  rgbaAtBoundary: Uint8ClampedArray;
  originalInput: Uint8ClampedArray;
  audioSamples: Float32Array;
  rawAudioSamples: Float32Array;
  videoContext: VideoFrameContext;
  remainingVideoNodeIds: string[];
}

export interface PipelineTimings {
  setupMs: number;
  colorEncodeMs: number;
  streamEncodeMs: number;
  audioDspMs: number;
  audioLevelsMs: number;
  streamDecodeMs: number;
  colorDecodeMs: number;
  videoDspMs: number;
  equalizeBlendMs: number;
}

export interface PipelineFrameOptions {
  /** Controlled effect clock for conformance; omitted preserves processing-start time. */
  timeMs?: number;
  profile?: boolean;
}

type Segment =
  | { kind: 'audio'; filters: IDspFilter[]; isLast: boolean }
  | { kind: 'video'; filters: IVideoFilter[] };

export class SonopticonPipeline {
  tapeSatState(preset:SonopticonPreset,width:number,height:number,id:string,state?:ReturnType<TapeSaturationFilter['exportState']>) {
    this.syncChain(preset,width,height);
    const filter=this.instanceCache.get(`audio:${id}`)?.inst;
    if(!(filter instanceof TapeSaturationFilter))throw new Error('TapeSat instance unavailable');
    if(state)filter.importState(state);
    return filter.exportState();
  }
  residentVideoContext(audioSamples:Float32Array,width:number,height:number,timeMs=performance.now()):VideoFrameContext {
    // The resident monitor contains every fourth output sample for the frozen
    // 720p R3 route; the reference reducer samples 1024 values at stride 2700.
    this.measureAudio(audioSamples);
    return {width,height,timeMs,audioRms:this.lastAudioRms,audioPeak:this.lastAudioPeak};
  }
  constructor(
    private readonly audioFactory: typeof createFilterInstance = createFilterInstance,
    private readonly segmentProcessor?: (filters: IDspFilter[], samples: Float32Array) => void,
    private readonly sampleBufferFactory?: (length: number) => Float32Array,
  ) {}
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
  private workAudioBuffer: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private rawAudioPreviewBuffer = new Float32Array(2048);
  private chunkViews: Float32Array[] = [];
  private lastChunkSamples = 0;
  private static readonly CHUNK_SIZE = 8192; // 32 KiB sample tile; cache behavior depends on hardware.

  private ensureBuffers(numPixels: number, numSamples: number): void {
    const rgbaBytes = numPixels * 4;
    const audioSamples = numPixels * 3;

    if (this.workRgbaBuffer.length < rgbaBytes) {
      this.workRgbaBuffer = new Uint8ClampedArray(rgbaBytes);
    }
    if (this.workAudioBuffer.length < audioSamples) {
      this.workAudioBuffer = this.sampleBufferFactory?.(audioSamples) ?? new Float32Array(audioSamples);
      if (this.workAudioBuffer.length < audioSamples) throw new Error('Audio buffer factory returned an undersized view');
      this.lastChunkSamples = 0;
    }

    if (this.lastChunkSamples !== numSamples) {
      this.chunkViews = [];
      const CHUNK_SIZE = SonopticonPipeline.CHUNK_SIZE;
      for (let offset = 0; offset < numSamples; offset += CHUNK_SIZE) {
        const end = Math.min(offset + CHUNK_SIZE, numSamples);
        this.chunkViews.push(this.workAudioBuffer.subarray(offset, end));
      }
      this.lastChunkSamples = numSamples;
    }
  }

  /** Rebuild segments if the chain structure changed; otherwise push params in place. */
  private syncChain(preset: SonopticonPreset, width: number, height: number): void {
    // UI edits may mutate arrays/configs in place. Reference equality cannot detect
    // enabled/order/type/rate changes, and replacement configs need fresh params.
    const ordered = resolveChain(preset);
    const key = JSON.stringify([width, height, ordered.map(e => [
      e.kind, e.cfg.id, e.cfg.type, e.cfg.enabled,
      e.kind === 'audio' ? e.cfg.sampleRate : null,
    ])]);

    if (key !== this.chainKey) {
      const nextCache = new Map<string, { sig: string; inst: IDspFilter | IVideoFilter }>();
      const segments: Segment[] = [];
      const nodes: { inst: IDspFilter | IVideoFilter; cfgRef: { params: Record<string, number> } }[] = [];
      let hasVideo = false;

      for (const e of ordered) {
        const sig = e.kind === 'audio' ? `a:${e.cfg.type}:${e.cfg.sampleRate}` : `v:${e.cfg.type}:${width}x${height}`;
        const cacheKey = `${e.kind}:${e.cfg.id}`;
        let entry = this.instanceCache.get(cacheKey);
        if (!e.cfg.enabled) {
          // Bypass freezes history. Removed nodes or incompatible type/rate/size
          // invalidate it; disabled nodes are not processed or newly allocated.
          if (entry?.sig === sig) nextCache.set(cacheKey, entry);
          continue;
        }
        if (!entry || entry.sig !== sig) {
          let inst: IDspFilter | IVideoFilter;
          if (e.kind === 'audio') {
            inst = this.audioFactory(e.cfg.type, e.cfg.sampleRate);
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
    } else {
      let index = 0;
      for (const e of ordered) {
        if (e.cfg.enabled) this.nodes[index++].cfgRef = e.cfg;
      }
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
    preset: SonopticonPreset,
    outputTargetRgba?: Uint8ClampedArray,
    options?: PipelineFrameOptions
  ): PipelineResult {
    return this.runFrame(inputRgba,width,height,preset,outputTargetRgba,options,false);
  }

  /** Execute the shared compiled chain up to its final video segment. */
  processPrefix(
    inputRgba: Uint8ClampedArray,
    width: number,
    height: number,
    preset: SonopticonPreset,
    outputTargetRgba?: Uint8ClampedArray,
    options?: PipelineFrameOptions,
    videoTailCount?: number
  ): PipelineResult {
    return this.runFrame(inputRgba,width,height,preset,outputTargetRgba,options,true,videoTailCount);
  }

  /** Complete only the retained final video segment after a prefix run. */
  processCpuTail(prefix: PipelinePrefixResult): Uint8ClampedArray {
    const tail=this.pendingVideoTail;
    if(!tail || tail.token!==prefix.token)throw new Error('No pending CPU video tail for this frame');
    if(prefix.remainingVideoNodeIds.join('\0')!==tail.nodeIds.join('\0'))throw new Error('CPU video tail does not match the current prefix');
    for(const filter of tail.filters)filter.processFrame(prefix.rgbaAtBoundary, prefix.videoContext);
    this.pendingVideoTail=undefined;
    return prefix.rgbaAtBoundary;
  }

  private pendingVideoTail:{token:object;filters:IVideoFilter[];nodeIds:string[]}|undefined;

  private runFrame(
    inputRgba: Uint8ClampedArray,
    width: number,
    height: number,
    preset: SonopticonPreset,
    outputTargetRgba: Uint8ClampedArray|undefined,
    options: PipelineFrameOptions|undefined,
    splitFinalVideo: boolean,
    requestedVideoTailCount?:number
  ): PipelineResult {
    const t0 = performance.now();
    if (outputTargetRgba && inputRgba.buffer === outputTargetRgba.buffer &&
      inputRgba.byteOffset < outputTargetRgba.byteOffset + outputTargetRgba.byteLength &&
      outputTargetRgba.byteOffset < inputRgba.byteOffset + inputRgba.byteLength) {
      throw new Error('Pipeline input and output must not overlap');
    }
    const timings: PipelineTimings | undefined = options?.profile ? {
      setupMs: 0, colorEncodeMs: 0, streamEncodeMs: 0, audioDspMs: 0,
      audioLevelsMs: 0, streamDecodeMs: 0, colorDecodeMs: 0,
      videoDspMs: 0, equalizeBlendMs: 0,
    } : undefined;
    const effectTimeMs = options?.timeMs ?? t0;
    const numPixels = width * height;
    const numSamples = Math.floor((numPixels * 3) / (preset.reader.bits === 8 ? 1 : preset.reader.bits === 16 ? 2 : 3));
    this.ensureBuffers(numPixels, numSamples);
    this.syncChain(preset, width, height);
    this.pendingVideoTail=undefined;
    if (timings) timings.setupMs = performance.now() - t0;

    const outRgba = outputTargetRgba || new Uint8ClampedArray(numPixels * 4);

    // `cur` is the current image. It starts as the read-only input and moves to outRgba
    // the first time a stage writes.
    let cur: Uint8ClampedArray = inputRgba;
    let audioStream: Float32Array = this.workAudioBuffer.subarray(0, numSamples);
    let firstAudio = true;
    let copyLen = 0;
    let splitVideoContext:VideoFrameContext|undefined;
    let splitVideoSegment:Extract<Segment,{kind:'video'}>|undefined;
    const finalSegment=this.segments.at(-1);
    const splitVideoTailCount=Math.min(finalSegment?.kind==='video'?finalSegment.filters.length:0,Math.max(0,Math.floor(requestedVideoTailCount??Number.MAX_SAFE_INTEGER)));
    if(splitFinalVideo && splitVideoTailCount>0 && finalSegment?.kind==='video')splitVideoSegment=finalSegment;

    for (const seg of this.segments) {
      if (seg.kind === 'video') {
        const start = timings ? performance.now() : 0;
        if (cur === inputRgba) {
          outRgba.set(inputRgba.subarray(0, numPixels * 4));
          cur = outRgba;
        }
        const videoCtx: VideoFrameContext = {
          width,
          height,
          timeMs: effectTimeMs,
          audioRms: this.lastAudioRms,
          audioPeak: this.lastAudioPeak,
        };
        const fl = seg===splitVideoSegment?seg.filters.slice(0,-splitVideoTailCount):seg.filters;
        for (let i = 0; i < fl.length; i++) fl[i].processFrame(outRgba, videoCtx);
        if (timings) timings.videoDspMs += performance.now() - start;
        continue;
      }

      // Audio segment. Color space transform: if RGB, bypass the 8MB memcpy completely!
      let srcRgba: Uint8ClampedArray;
      let start = timings ? performance.now() : 0;
      if (preset.reader.colorSpace === 'RGB') {
        srcRgba = cur;
      } else {
        this.workRgbaBuffer.set(cur.subarray(0, numPixels * 4));
        convertToColorSpace(this.workRgbaBuffer.subarray(0, numPixels * 4), preset.reader.colorSpace);
        srcRgba = this.workRgbaBuffer;
      }
      if (timings) {
        timings.colorEncodeMs += performance.now() - start;
        start = performance.now();
      }

      // Encode image pixels into 1D audio sample stream [-1.0, 1.0]
      audioStream = imageToAudioStream(
        srcRgba.subarray(0, numPixels * 4),
        preset.reader,
        this.workAudioBuffer.subarray(0, numSamples)
      );
      if (timings) timings.streamEncodeMs += performance.now() - start;

      // Snapshot preview of the unmodulated stream before the first DSP segment
      if (firstAudio) {
        copyLen = Math.min(audioStream.length, this.rawAudioPreviewBuffer.length);
        this.rawAudioPreviewBuffer.set(audioStream.subarray(0, copyLen));
        firstAudio = false;
      }

      // Run audio DSP chain in-place with preallocated L1 cache chunk fusion
      const fl = seg.filters;
      start = timings ? performance.now() : 0;
      const numFilters = fl.length;
      if (this.segmentProcessor && numFilters > 0) {
        this.segmentProcessor(fl, audioStream);
      } else if (numFilters === 1) {
        fl[0].processBlock(audioStream);
      } else if (numFilters > 1) {
        const chunks = this.chunkViews;
        const numChunks = chunks.length;
        for (let c = 0; c < numChunks; c++) {
          const chunk = chunks[c];
          for (let f = 0; f < numFilters; f++) fl[f].processBlock(chunk);
        }
      }
      if (timings) {
        timings.audioDspMs += performance.now() - start;
        start = performance.now();
      }
      if (this.hasVideo) this.measureAudio(audioStream);
      if (timings) {
        timings.audioLevelsMs += performance.now() - start;
        start = performance.now();
      }

      // Decode the stream back into image pixels, then revert the color space
      if (
        fl.length === 0 &&
        preset.reader.colorSpace === preset.writer.colorSpace &&
        preset.reader.bits === preset.writer.bits &&
        preset.reader.rawType === preset.writer.rawType &&
        preset.reader.law === preset.writer.law &&
        preset.reader.sign === preset.writer.sign &&
        preset.reader.endianess === preset.writer.endianess
      ) {
        if (cur === inputRgba) {
          outRgba.set(inputRgba.subarray(0, numPixels * 4));
        }
        cur = outRgba;
        if (timings) timings.streamDecodeMs += performance.now() - start;
      } else {
        audioStreamToImage(audioStream, preset.writer, outRgba);
        if (timings) {
          timings.streamDecodeMs += performance.now() - start;
          start = performance.now();
        }
        convertFromColorSpace(outRgba, preset.writer.colorSpace);
        if (timings) timings.colorDecodeMs += performance.now() - start;
        cur = outRgba;
      }

      // Equalize & blend belong to the final audio stage
      if (seg.isLast) {
        start = timings ? performance.now() : 0;
        if (preset.equalize) equalizeHistogram(outRgba);
        if (preset.blendMode !== 'NONE' && preset.blendAmount > 0) {
          this.blend(inputRgba, outRgba, preset.blendMode, preset.blendAmount);
        }
        if (timings) timings.equalizeBlendMs += performance.now() - start;
      }
    }

    const t1 = performance.now();

    let prefix:PipelinePrefixResult|undefined;
    if(splitVideoSegment){
      splitVideoContext={width,height,timeMs:effectTimeMs,audioRms:this.lastAudioRms,audioPeak:this.lastAudioPeak};
      const ordered=resolveChain(preset).filter(entry=>entry.kind==='video'&&entry.cfg.enabled);
      const filters=splitVideoSegment.filters.slice(-splitVideoTailCount);
      const nodeIds=ordered.slice(-filters.length).map(entry=>entry.cfg.id);
      const token={};
      this.pendingVideoTail={token,filters,nodeIds};
      prefix={token,rgbaAtBoundary:outRgba,originalInput:inputRgba,audioSamples:audioStream,
        rawAudioSamples:this.rawAudioPreviewBuffer.subarray(0,copyLen),videoContext:splitVideoContext,remainingVideoNodeIds:nodeIds};
    }

    return {
      outputRgba: outRgba,
      audioSamples: audioStream,
      rawAudioSamples: this.rawAudioPreviewBuffer.subarray(0, copyLen),
      executionTimeMs: t1 - t0,
      timings,
      ...(prefix?{prefix}:{}),
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

export const SonificationPipeline = SonopticonPipeline;
export type SonificationPipeline = SonopticonPipeline;
