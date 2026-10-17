import type { VideoRecorder } from '../record/video-recorder.ts';
import type { OfflineVideoRecorder } from '../record/offline-video-recorder.ts';
import type { SonificationPipeline } from '../engine/pipeline.ts';
import type { SoundCameraAudio } from '../audio/sound-camera.ts';
import type { CameraManager } from '../camera/camera-manager.ts';
import type { SonificationPreset } from '../types/index.ts';
import { VideoTimeline } from './video-timeline.ts';

export interface MediaControllerOptions {
  canvas: HTMLCanvasElement;
  offscreenCanvas: HTMLCanvasElement;
  offscreenCtx: CanvasRenderingContext2D;
  pipeline: SonificationPipeline;
  videoRecorder: VideoRecorder;
  offlineVideoRecorder: OfflineVideoRecorder;
  audioEngine: SoundCameraAudio;
  cameraManager: CameraManager;
  getActivePreset: () => SonificationPreset;
  getBusRate: () => number;
  getIsSyncMode: () => boolean;
  isMobileDevice: () => boolean;
  isFrameProcessing: () => boolean;
  onFrameProcessed: (captureInput:()=>{data:ImageData;durationMs:number}, started?:number, capturedAt?:number) => void | Promise<void>;
  onCameraStopped: () => void;
  scheduleFrame: (video: HTMLVideoElement, callback: () => void) => void;
  stopFrameLoop: (reason?:string) => void;
  getLoopGeneration: () => number;
  measureSourceHash?:boolean;
  resumeLiveCamera?:()=>void;
}

export class MediaController {
  private loadedVideoElement: HTMLVideoElement | null = null;
  private loadedImageElement: HTMLImageElement | null = null;
  private liveResolution: '360p' | '480p' | '720p' | 'native' = '480p';
  private lastVideoTime = -1;
  private sourceInfo:{name:string;bytes:number;sha256?:string} | null=null;
  public getSourceInfo(){return this.sourceInfo;}

  private recTimerInterval: number | null = null;
  private recStartTime = 0;

  private videoTimeline: VideoTimeline;

  constructor(private opts: MediaControllerOptions) {
    this.videoTimeline = new VideoTimeline({
      onSeek: (time) => {
        if (this.loadedVideoElement) {
          this.loadedVideoElement.currentTime = time;
          this.lastVideoTime = -1;
          this.requestVideoFrameRender();
        }
      },
      onRangeChange: () => {},
      onTogglePlayPause: () => {
        this.toggleVideoPlayPause();
      },
    });
  }

  public getVideoTimeline(): VideoTimeline {
    return this.videoTimeline;
  }

  public toggleVideoPlayPause(): void {
    const v = this.loadedVideoElement;
    if (!v) return;
    if (v.paused) {
      v.play().catch(console.warn);
      this.videoTimeline.setPlaying(true);
      this.startVideoFileLoop();
    } else {
      v.pause();
      this.videoTimeline.setPlaying(false);
    }
  }

  private requestVideoFrameRender(): void {
    const cur = this.loadedVideoElement;
    if (!cur || cur.readyState < 2) return;
    const dims = this.getTargetDimensions(cur.videoWidth || 640, cur.videoHeight || 480);
    if (this.opts.offscreenCanvas.width !== dims.w || this.opts.offscreenCanvas.height !== dims.h) {
      this.opts.offscreenCanvas.width = dims.w;
      this.opts.offscreenCanvas.height = dims.h;
    }
    if (this.opts.canvas.width !== dims.w || this.opts.canvas.height !== dims.h) {
      this.opts.canvas.width = dims.w;
      this.opts.canvas.height = dims.h;
    }
    this.opts.offscreenCtx.drawImage(cur, 0, 0, dims.w, dims.h);
    const inputBuffer = this.opts.offscreenCtx.getImageData(0, 0, dims.w, dims.h);
    this.opts.onFrameProcessed(()=>({data:inputBuffer,durationMs:0}));
  }

  public getLoadedVideo(): HTMLVideoElement | null {
    return this.loadedVideoElement;
  }

  public getLoadedImage(): HTMLImageElement | null {
    return this.loadedImageElement;
  }

  public setResolution(res: '360p' | '480p' | '720p' | 'native'): void {
    this.liveResolution = res;
    if (this.loadedImageElement) {
      this.refreshLoadedImage();
    }
  }

  public getTargetDimensions(srcW: number, srcH: number): { w: number; h: number } {
    if (this.liveResolution === 'native') return { w: Math.max(2, srcW & ~1), h: Math.max(2, srcH & ~1) };

    const targetShort = this.liveResolution === '360p' ? 360 : this.liveResolution === '480p' ? 480 : 720;
    const isPortrait = srcW < srcH;
    const currentShort = isPortrait ? srcW : srcH;

    if (currentShort <= targetShort) return { w: Math.max(2, srcW & ~1), h: Math.max(2, srcH & ~1) };

    if (isPortrait) {
      const targetW = targetShort;
      const targetH = Math.round(targetShort * (srcH / srcW));
      return { w: Math.max(2, targetW & ~1), h: Math.max(2, targetH & ~1) };
    } else {
      const targetH = targetShort;
      const targetW = Math.round(targetShort * (srcW / srcH));
      return { w: Math.max(2, targetW & ~1), h: Math.max(2, targetH & ~1) };
    }
  }

  public showVideoLoading(statusText: string, metaText: string): void {
    const overlay = document.getElementById('video-loading-overlay');
    const status = document.getElementById('video-loading-status');
    const meta = document.getElementById('video-loading-meta');
    if (status) status.textContent = statusText;
    if (meta) meta.textContent = metaText;
    overlay?.classList.remove('hidden');
  }

  public updateVideoLoading(statusText: string, metaText?: string): void {
    const status = document.getElementById('video-loading-status');
    const meta = document.getElementById('video-loading-meta');
    if (status) status.textContent = statusText;
    if (meta && metaText !== undefined) meta.textContent = metaText;
  }

  public hideVideoLoading(): void {
    const overlay = document.getElementById('video-loading-overlay');
    overlay?.classList.add('hidden');
  }

  public stopVideoFile(): void {
    this.sourceInfo=null;
    this.opts.stopFrameLoop('media-source-stopped-or-replaced');
    this.hideVideoLoading();
    this.videoTimeline.detachVideo();
    this.opts.audioEngine.detachMediaElement();
    if (this.loadedVideoElement) {
      this.loadedVideoElement.pause();
      this.loadedVideoElement.remove();
      URL.revokeObjectURL(this.loadedVideoElement.src);
      this.loadedVideoElement.src = '';
      this.loadedVideoElement = null;
    }
  }

  public loadVideoFromFile(file: File): void {
    this.opts.cameraManager.stop();
    this.opts.onCameraStopped();

    this.stopVideoFile();
    this.loadedImageElement = null;

    this.showVideoLoading('Opening video stream...', file.name);

    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.preload = 'auto';
    video.autoplay = true;
    video.loop = true;
    video.muted = false;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');

    // Keep video element attached to DOM host so Chromium compositor keeps it active
    const host = document.getElementById('video-hidden-host') || document.body;
    host.appendChild(video);

    this.loadedVideoElement = video;
    this.opts.audioEngine.attachMediaElement(video);
    this.sourceInfo={name:file.name,bytes:file.size};
    if(this.opts.measureSourceHash)void file.arrayBuffer().then(bytes=>crypto.subtle.digest('SHA-256',bytes)).then(digest=>{
      if(this.loadedVideoElement===video && this.sourceInfo)this.sourceInfo.sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
    }).catch(error=>console.warn('Source hash unavailable',error));

    let isStarted = false;
    const startPlayback = () => {
      if (isStarted || this.loadedVideoElement !== video) return;
      isStarted = true;
      this.hideVideoLoading();
      this.videoTimeline.setPlaying(true);
      video.play().catch((err) => {
        console.warn('Video auto-playback deferred:', err);
      });
      this.startVideoFileLoop();
    };

    video.onloadedmetadata = () => {
      if (this.loadedVideoElement !== video) return;
      this.videoTimeline.attachVideo(video);
      const dims = this.getTargetDimensions(video.videoWidth || 640, video.videoHeight || 480);
      const dur = !isNaN(video.duration) && video.duration > 0 ? `${video.duration.toFixed(1)}s` : '';
      this.updateVideoLoading(
        'Buffering frames into decoder...',
        `${video.videoWidth || 640}×${video.videoHeight || 480} → ${dims.w}×${dims.h} ${dur}`.trim()
      );

      if (video.readyState >= 3) {
        startPlayback();
      }
    };

    video.oncanplay = () => {
      startPlayback();
    };

    video.onerror = () => {
      this.hideVideoLoading();
      console.error('Video decode error:', video.error);
      alert('Could not decode video file: ' + (video.error?.message || 'Unsupported format or codec'));
    };

    // Safety timeout: if canplay doesn't fire within 2.5s but readyState >= 2, begin
    setTimeout(() => {
      if (!isStarted && this.loadedVideoElement === video && video.readyState >= 2) {
        startPlayback();
      }
    }, 2500);
  }

  public startVideoFileLoop(): void {
    this.opts.stopFrameLoop('video-loop-start');
    const generation = this.opts.getLoopGeneration();
    const v = this.loadedVideoElement;
    if (!v) return;

    this.lastVideoTime = -1;

    const onFrame = async () => {
      if (generation !== this.opts.getLoopGeneration() || this.loadedVideoElement !== v) return;
      const cur = this.loadedVideoElement;

      // Keep the decoder callback chain on the video's presentation clock.
      // Processing can take longer than one frame; waiting for it before
      // registering again leaves an avoidable gap and drops later callbacks.
      this.opts.scheduleFrame(cur, onFrame);

      // Keep the shared source canvas stable while the prior frame is processed.
      if (this.opts.isFrameProcessing()) return;

      // If temporarily paused or rebuffering, do not abandon the loop
      if (cur.paused && !cur.ended) {
        return;
      }

      // Check A-B loop boundaries and wrap to start if reached end (guard against recursive seek thrashing)
      if (!cur.seeking) {
        const wrapTime = this.videoTimeline.checkLoopBoundaries(cur.currentTime);
        if (wrapTime !== null && Math.abs(cur.currentTime - wrapTime) > 0.05) {
          cur.currentTime = wrapTime;
          this.lastVideoTime = -1;
        }
      }

      this.videoTimeline.updatePlayhead(cur.currentTime);

      if (cur.readyState >= 2 && cur.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = cur.currentTime;
        const dims = this.getTargetDimensions(cur.videoWidth || 640, cur.videoHeight || 480);

        if (this.opts.offscreenCanvas.width !== dims.w || this.opts.offscreenCanvas.height !== dims.h) {
          this.opts.offscreenCanvas.width = dims.w;
          this.opts.offscreenCanvas.height = dims.h;
        }
        if (this.opts.canvas.width !== dims.w || this.opts.canvas.height !== dims.h) {
          this.opts.canvas.width = dims.w;
          this.opts.canvas.height = dims.h;
        }

        const started=performance.now();
        this.opts.offscreenCtx.drawImage(cur, 0, 0, dims.w, dims.h);
        const capturedAt=performance.now();
        const captureInput=()=>{const captureStarted=performance.now();return {data:this.opts.offscreenCtx.getImageData(0,0,dims.w,dims.h),durationMs:performance.now()-captureStarted};};
        await this.opts.onFrameProcessed(captureInput,started,capturedAt);
      }

    };

    this.opts.scheduleFrame(v, onFrame);
  }

  public loadImageFromFile(file: File): void {
    this.stopVideoFile();
    const img = new Image();
    img.onload = () => {
      this.opts.cameraManager.stop();
      this.opts.onCameraStopped();

      this.loadedImageElement = img;
      this.refreshLoadedImage();
    };
    img.src = URL.createObjectURL(file);
  }

  public refreshLoadedImage(): void {
    if (!this.loadedImageElement) return;
    const img = this.loadedImageElement;
    const dims = this.getTargetDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height);

    if (this.opts.offscreenCanvas.width !== dims.w || this.opts.offscreenCanvas.height !== dims.h) {
      this.opts.offscreenCanvas.width = dims.w;
      this.opts.offscreenCanvas.height = dims.h;
    }
    if (this.opts.canvas.width !== dims.w || this.opts.canvas.height !== dims.h) {
      this.opts.canvas.width = dims.w;
      this.opts.canvas.height = dims.h;
    }

    this.opts.offscreenCtx.drawImage(img, 0, 0, dims.w, dims.h);
    const inputBuffer = this.opts.offscreenCtx.getImageData(0, 0, dims.w, dims.h);
    this.opts.onFrameProcessed(()=>({data:inputBuffer,durationMs:0}));
  }

  public triggerShutterSnapshot(): void {
    const flash = document.getElementById('mobile-shutter-flash');
    if (flash) {
      flash.classList.add('flashing');
      setTimeout(() => flash.classList.remove('flashing'), 120);
    }
    this.saveFullResolutionSnapshot();
  }

  public saveFullResolutionSnapshot(): void {
    if(!this.opts.measureSourceHash){this.renderFullResolutionSnapshot();return;}
    this.opts.stopFrameLoop('snapshot-export');
    try{this.renderFullResolutionSnapshot();}finally{
      if(this.opts.cameraManager.isActive())this.opts.resumeLiveCamera?.();
      else if(this.loadedVideoElement)this.startVideoFileLoop();
    }
  }
  private renderFullResolutionSnapshot():void {
    let fullW = this.opts.canvas.width;
    let fullH = this.opts.canvas.height;
    let sourceDrawable: CanvasImageSource = this.opts.canvas;

    if (this.loadedImageElement) {
      fullW = this.loadedImageElement.naturalWidth || this.loadedImageElement.width;
      fullH = this.loadedImageElement.naturalHeight || this.loadedImageElement.height;
      sourceDrawable = this.loadedImageElement;
    } else if (this.loadedVideoElement) {
      fullW = this.loadedVideoElement.videoWidth || fullW;
      fullH = this.loadedVideoElement.videoHeight || fullH;
      sourceDrawable = this.loadedVideoElement;
    } else if (this.opts.cameraManager.isActive()) {
      const cam = this.opts.cameraManager.getVideoElement();
      fullW = cam.videoWidth || fullW;
      fullH = cam.videoHeight || fullH;
      sourceDrawable = cam;
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = fullW;
    exportCanvas.height = fullH;
    const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true })!;
    exportCtx.drawImage(sourceDrawable, 0, 0, fullW, fullH);

    const srcData = exportCtx.getImageData(0, 0, fullW, fullH);
    const outData = exportCtx.createImageData(fullW, fullH);

    this.opts.pipeline.processFrame(
      srcData.data,
      fullW,
      fullH,
      this.opts.getActivePreset(),
      outData.data
    );

    exportCtx.putImageData(outData, 0, 0);

    const link = document.createElement('a');
    link.download = `sonification_${fullW}x${fullH}_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  public async startOfflineVideoRecording(): Promise<void> {
    if (!this.loadedVideoElement) return;
    this.opts.stopFrameLoop('offline-recording-start');

    const v = this.loadedVideoElement;
    const btnRec = document.getElementById('btn-record-video') as HTMLButtonElement | null;
    const recText = document.getElementById('rec-btn-text');
    const progressOverlay = document.getElementById('render-progress-overlay');
    const progressFill = document.getElementById('render-progress-bar-fill');
    const progressCounter = document.getElementById('render-progress-counter');
    const progressFps = document.getElementById('render-progress-fps');

    const dims = this.getTargetDimensions(v.videoWidth || 640, v.videoHeight || 480);
    const w = dims.w & ~1;
    const h = dims.h & ~1;
    this.opts.canvas.width = w;
    this.opts.canvas.height = h;
    this.opts.offscreenCanvas.width = w;
    this.opts.offscreenCanvas.height = h;

    btnRec?.classList.add('recording');
    if (recText) recText.textContent = 'STOP';
    progressOverlay?.classList.remove('hidden');
    if (progressFill) progressFill.style.width = '0%';
    if (progressCounter) progressCounter.textContent = '0 / 0 (0%)';
    if (progressFps) progressFps.textContent = 'STARTING OFFLINE RENDER • TARGET: 30 FPS';

    const loop = this.videoTimeline.getLoopRange();

    try {
      const res = await this.opts.offlineVideoRecorder.render({
        video: v,
        canvas: this.opts.canvas,
        activePreset: this.opts.getActivePreset(),
        targetFps: 30,
        audioSampleRate: this.opts.getBusRate(),
        startTime: loop.start,
        endTime: loop.end,
        onProgress: (prog) => {
          if (progressFill) progressFill.style.width = `${prog.percent}%`;
          if (progressCounter) {
            progressCounter.textContent = `${prog.currentFrame} / ${prog.totalFrames} (${prog.percent}%)`;
          }
          if (progressFps) {
            progressFps.textContent = `PROCESSING @ ${prog.fps} FPS • COMPACTING TO 30 FPS`;
          }
        },
      });

      if (res && res.blob) {
        const url = URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sonification_offline_${Date.now()}.${res.ext}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Offline video recording failed:', err);
      alert('Offline video recording failed: ' + (err as Error).message);
    } finally {
      progressOverlay?.classList.add('hidden');
      btnRec?.classList.remove('recording');
      if (recText) recText.textContent = 'REC';
      this.startVideoFileLoop();
    }
  }

  public async toggleVideoRecording(): Promise<void> {
    const btnRec = document.getElementById('btn-record-video') as HTMLButtonElement | null;
    const btnMobileRec = document.getElementById('btn-mobile-rec') as HTMLButtonElement | null;
    const recText = document.getElementById('rec-btn-text');
    const recTimerBadge = document.getElementById('rec-timer-badge');
    const recTimeDisplay = document.getElementById('rec-time-display');
    const mobileRecBadge = document.getElementById('mobile-rec-badge');
    const mobileRecTimer = document.getElementById('mobile-rec-timer');

    if (this.opts.offlineVideoRecorder.getIsRunning()) {
      this.opts.offlineVideoRecorder.stopEarly();
      return;
    }

    if (!this.opts.getIsSyncMode() && this.loadedVideoElement) {
      await this.startOfflineVideoRecording();
      return;
    }

    if (!this.opts.videoRecorder.getIsRecording()) {
      this.opts.canvas.width = Math.max(2, this.opts.canvas.width & ~1);
      this.opts.canvas.height = Math.max(2, this.opts.canvas.height & ~1);

      this.opts.audioEngine.setIsRecording(true);
      this.opts.videoRecorder.startRecording(this.opts.canvas, this.opts.audioEngine.getAudioMediaStream());
      btnRec?.classList.add('recording');
      btnMobileRec?.classList.add('recording');
      if (recText) recText.textContent = 'STOP';

      this.recStartTime = Date.now();
      recTimerBadge?.classList.remove('hidden');
      mobileRecBadge?.classList.remove('hidden');
      if (recTimeDisplay) recTimeDisplay.textContent = '00:00';
      if (mobileRecTimer) mobileRecTimer.textContent = '00:00';

      this.recTimerInterval = window.setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - this.recStartTime) / 1000);
        const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const s = String(elapsedSec % 60).padStart(2, '0');
        const timeStr = `${m}:${s}`;
        if (recTimeDisplay) recTimeDisplay.textContent = timeStr;
        if (mobileRecTimer) mobileRecTimer.textContent = timeStr;
      }, 500);
    } else {
      if (this.recTimerInterval) {
        clearInterval(this.recTimerInterval);
        this.recTimerInterval = null;
      }
      recTimerBadge?.classList.add('hidden');
      mobileRecBadge?.classList.add('hidden');
      if (recTimeDisplay) recTimeDisplay.textContent = '00:00';
      if (mobileRecTimer) mobileRecTimer.textContent = '00:00';

      const { blob, ext } = await this.opts.videoRecorder.stopRecording();
      this.opts.audioEngine.setIsRecording(false);
      btnRec?.classList.remove('recording');
      btnMobileRec?.classList.remove('recording');
      if (recText) recText.textContent = 'REC';

      if (this.opts.isMobileDevice() && typeof navigator.share === 'function') {
        const file = new File([blob], `sonification_${Date.now()}.${ext}`, {
          type: blob.type || (ext === 'mp4' ? 'video/mp4' : 'video/webm'),
        });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Sonification Recording',
            });
            return;
          } catch (shareErr) {
            if ((shareErr as Error).name === 'AbortError') {
              return;
            }
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sonification_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
    }
  }
}
