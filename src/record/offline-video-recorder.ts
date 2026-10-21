import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { SonopticonPipeline, PipelineResult } from '../engine/pipeline.ts';
import type { SonopticonPreset } from '../types/index.ts';

export interface OfflineRenderProgress {
  currentFrame: number;
  totalFrames: number;
  percent: number;
  fps: number;
}

export interface OfflineRenderOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  /** Create an isolated pipeline for this export; defaults to the JS reference pipeline. */
  pipelineFactory?: () => SonopticonPipeline;
  activePreset: SonopticonPreset;
  targetFps?: number;
  audioSampleRate?: number;
  startTime?: number;
  endTime?: number;
  synthVolume?: number;
  sourceVolume?: number;
  sourceAudioBuffer?: AudioBuffer | null;
  onProgress?: (progress: OfflineRenderProgress) => void;
}

export class OfflineVideoRecorder {
  private isAborted = false;
  private isFinishingEarly = false;
  private isRunning = false;

  cancel(): void {
    this.isAborted = true;
  }

  stopEarly(): void {
    this.isFinishingEarly = true;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  async render(options: OfflineRenderOptions): Promise<{ blob: Blob; ext: string } | null> {
    const {
      video,
      canvas,
      activePreset,
      targetFps = 30,
      audioSampleRate = 44100,
      onProgress,
    } = options;

    this.isAborted = false;
    this.isFinishingEarly = false;
    this.isRunning = true;
    // Offline rendering must not advance the live preview's stateful filters.
    // Keep exports on the reference backend unless a separately verified factory
    // is explicitly supplied.
    const pipeline = options.pipelineFactory?.() ?? new SonopticonPipeline();

    // Preserve original video state
    const originalTime = video.currentTime;
    const wasPaused = video.paused;
    video.pause();

    // Ensure video duration is valid
    const rawDuration = video.duration;
    if (!rawDuration || isNaN(rawDuration) || rawDuration <= 0) {
      this.isRunning = false;
      throw new Error('Invalid video duration');
    }

    const startSec = Math.max(0, Math.min(rawDuration, options.startTime ?? 0));
    const endSec = Math.max(startSec + 0.05, Math.min(rawDuration, options.endTime ?? rawDuration));
    const duration = endSec - startSec;

    const totalFrames = Math.max(1, Math.floor(duration * targetFps));

    // Ensure even width and height for H.264 codec
    const width = (canvas.width || 640) & ~1;
    const height = (canvas.height || 480) & ~1;
    canvas.width = width;
    canvas.height = height;

    // Create offscreen canvas for source video frame capture
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true })!;

    const mainCtx = canvas.getContext('2d', { willReadFrequently: true })!;
    const cachedImageData = mainCtx.createImageData(width, height);

    // Setup Audio Encoder if supported
    let audioEncoder: AudioEncoder | null = null;
    let audioCodec: 'aac' | undefined = undefined;

    if (typeof AudioEncoder !== 'undefined') {
      try {
        const aacConfig: AudioEncoderConfig = {
          codec: 'mp4a.40.2',
          sampleRate: audioSampleRate,
          numberOfChannels: 1,
          bitrate: 128_000,
        };
        const aacSupport = await AudioEncoder.isConfigSupported(aacConfig);
        if (aacSupport && aacSupport.supported) {
          audioCodec = 'aac';
        }
      } catch (_) {}
    }

    // Setup MP4 Muxer
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height,
        frameRate: targetFps,
      },
      audio: audioCodec
        ? {
            codec: audioCodec,
            numberOfChannels: 1,
            sampleRate: audioSampleRate,
          }
        : undefined,
      fastStart: 'in-memory',
    });

    // Configure Video Encoder
    let videoEncoder: VideoEncoder | null = null;
    if (typeof VideoEncoder !== 'undefined') {
      const videoConfig: VideoEncoderConfig = {
        codec: 'avc1.42001f', // Baseline Profile Level 3.1
        width,
        height,
        bitrate: 4_000_000,
        framerate: targetFps,
      };

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error('VideoEncoder error:', e),
      });
      videoEncoder.configure(videoConfig);
    } else {
      throw new Error('WebCodecs VideoEncoder is not supported in this browser environment.');
    }

    // Configure Audio Encoder if available
    if (audioCodec) {
      try {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => console.error('AudioEncoder error:', e),
        });
        audioEncoder.configure({
          codec: 'mp4a.40.2',
          sampleRate: audioSampleRate,
          numberOfChannels: 1,
          bitrate: 128_000,
        });
      } catch (e) {
        console.warn('Could not configure AudioEncoder, proceeding video-only', e);
        audioEncoder = null;
      }
    }

    // Audio sample pacing queue
    const audioQueue: number[] = [];
    let audioTimestampUs = 0;
    const samplesPerVideoFrame = Math.round(audioSampleRate / targetFps);

    // Audio mixing parameters
    const synthVol = options.synthVolume !== undefined ? Math.max(0, options.synthVolume) : 1.0;
    const srcVol = options.sourceVolume !== undefined ? Math.max(0, options.sourceVolume) : 1.0;
    const sourceAudio = options.sourceAudioBuffer || null;
    const sourceChannelData: Float32Array[] = [];
    if (sourceAudio) {
      for (let c = 0; c < sourceAudio.numberOfChannels; c++) {
        sourceChannelData.push(sourceAudio.getChannelData(c));
      }
    }

    const startTime = performance.now();
    let encodedFrames = 0;

    try {
      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        if (this.isAborted || this.isFinishingEarly) {
          break;
        }

        const targetTime = startSec + (frameIdx / targetFps);

        // Deterministic seek to exact frame position
        await this.seekVideo(video, targetTime);

        // Draw source video frame to offscreen canvas
        offCtx.drawImage(video, 0, 0, width, height);
        const srcData = offCtx.getImageData(0, 0, width, height);

        // Process through the DSP sonopticon pipeline
        const res: PipelineResult = pipeline.processFrame(
          srcData.data,
          width,
          height,
          activePreset,
          cachedImageData.data
        );

        // Blit processed image to visible canvas so user watches offline render progress
        mainCtx.putImageData(cachedImageData, 0, 0);

        // Encode video frame with microsecond timestamps
        const timestampUs = Math.round((frameIdx * 1_000_000) / targetFps);
        const durationUs = Math.round(1_000_000 / targetFps);

        const videoFrame = new VideoFrame(canvas, {
          timestamp: timestampUs,
          duration: durationUs,
        });
        videoEncoder.encode(videoFrame, { keyFrame: frameIdx % 30 === 0 });
        videoFrame.close();
        encodedFrames++;

        // Process and blend audio samples for this frame
        if (audioEncoder) {
          const hasSynthAudio = res.audioSamples && res.audioSamples.length > 0;
          const synthStride = hasSynthAudio ? Math.max(1, Math.floor(res.audioSamples.length / samplesPerVideoFrame)) : 1;

          for (let s = 0; s < samplesPerVideoFrame; s++) {
            let synthSample = 0;
            if (hasSynthAudio) {
              synthSample = (res.audioSamples[s * synthStride] || 0) * synthVol;
            }

            let sourceSample = 0;
            if (sourceAudio && sourceChannelData.length > 0) {
              const sampleTime = targetTime + (s / audioSampleRate);
              const sampleIdx = Math.floor(sampleTime * sourceAudio.sampleRate);
              if (sampleIdx >= 0 && sampleIdx < sourceAudio.length) {
                // Downmix channels to mono for AAC track
                let sum = 0;
                for (let ch = 0; ch < sourceChannelData.length; ch++) {
                  sum += sourceChannelData[ch][sampleIdx] || 0;
                }
                sourceSample = (sum / sourceChannelData.length) * srcVol;
              }
            }

            audioQueue.push(synthSample + sourceSample);
          }

          // AAC frames require 1024 samples
          while (audioQueue.length >= 1024) {
            const chunk = new Float32Array(audioQueue.splice(0, 1024));
            try {
              const audioData = new AudioData({
                format: 'f32-planar',
                sampleRate: audioSampleRate,
                numberOfFrames: 1024,
                numberOfChannels: 1,
                timestamp: audioTimestampUs,
                data: chunk,
              });
              audioEncoder.encode(audioData);
              audioData.close();
            } catch (err) {
              console.warn('Audio encode glitch', err);
            }
            audioTimestampUs += Math.round((1024 * 1_000_000) / audioSampleRate);
          }
        }

        // Notify UI progress
        const percent = Math.round(((frameIdx + 1) / totalFrames) * 100);
        const elapsedSec = (performance.now() - startTime) / 1000;
        const currentRenderFps = elapsedSec > 0 ? (frameIdx + 1) / elapsedSec : 0;

        if (onProgress) {
          onProgress({
            currentFrame: frameIdx + 1,
            totalFrames,
            percent,
            fps: Math.round(currentRenderFps * 10) / 10,
          });
        }

        // Allow microtask tick for DOM updates
        await new Promise((r) => setTimeout(r, 0));
      }

      if (this.isAborted && encodedFrames === 0) {
        return null;
      }

      // Flush remaining audio queue (pad with zeros to 1024)
      if (audioEncoder && audioQueue.length > 0) {
        while (audioQueue.length < 1024) {
          audioQueue.push(0);
        }
        const chunk = new Float32Array(audioQueue.splice(0, 1024));
        try {
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: audioSampleRate,
            numberOfFrames: 1024,
            numberOfChannels: 1,
            timestamp: audioTimestampUs,
            data: chunk,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        } catch (_) {}
      }

      // Flush encoders and finalize container
      if (audioEncoder) {
        await audioEncoder.flush();
      }
      await videoEncoder.flush();
      muxer.finalize();

      const buffer = (muxer.target as ArrayBufferTarget).buffer;
      const blob = new Blob([buffer], { type: 'video/mp4' });

      return { blob, ext: 'mp4' };
    } finally {
      this.isRunning = false;
      // Restore video playback state
      video.currentTime = originalTime;
      if (!wasPaused) {
        video.play().catch(() => {});
      }
    }
  }

  private seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - time) < 0.001) {
        resolve();
        return;
      }

      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          video.removeEventListener('seeked', done);
          resolve();
        }
      };

      video.addEventListener('seeked', done, { once: true });
      video.currentTime = time;

      // Timeout fallback in case video is already at the requested time
      setTimeout(done, 120);
    });
  }
}
