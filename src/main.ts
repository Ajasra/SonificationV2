// Main application entry point for Sonification V2
// Modular architecture: Photographic Studio aesthetic, Audio Rack / PCB hardware details, and Tactile Rotary Knobs
import type { ColorSpace, CompandingLaw, FilterId, RawType, SonificationPreset, VideoFilterId } from './types/index.ts';
import { SonificationPipeline } from './engine/pipeline.ts';
import type {AppTapeSatGpu} from './engine/backends/app-tapesat.ts';
import type {AppWebGpuVideoTail} from './engine/backends/app-webgpu-video-tail.ts';
import type {WasmDspRuntime} from './engine/backends/wasm.ts';
import {eligibleResidentVideoRack,eligibleTapeSat,isAccelerationBenchmark,planApplicationRoute,shouldEnableTapeSatGpu} from './engine/backends/gpu-eligibility.ts';
import type {ApplicationRoutePlan} from './engine/backends/gpu-eligibility.ts';
import {summarize} from './benchmark/report.ts';
import {BUILD_INFO} from './build-info.ts';
import { PresetManager } from './presets/preset-manager.ts';
import { FILTER_DESCRIPTORS } from './engine/filters/factory.ts';
import { VIDEO_FILTER_DESCRIPTORS } from './engine/video-filters/factory.ts';
import { SoundCameraAudio } from './audio/sound-camera.ts';
import { CameraManager } from './camera/camera-manager.ts';
import { VideoRecorder } from './record/video-recorder.ts';
import { OfflineVideoRecorder } from './record/offline-video-recorder.ts';
import { RotaryKnob } from './components/rotary-knob.ts';
import { AccountManager, type StoredPreset } from './account/account-manager.ts';
import { validatePreset } from './presets/validate-preset.ts';
import { HudOverlay } from './components/hud-overlay.ts';
import { createResolutionSlider } from './ui/resolution-slider.ts';

// Extracted UI Controllers
import { QrModalController } from './ui/qr-modal.ts';
import { FilterLibraryModalController } from './ui/filter-library-modal.ts';
import { AccountModalController } from './ui/account-modal.ts';
import { ChainRackController } from './ui/chain-rack-controller.ts';
import { MobileController } from './ui/mobile-controller.ts';
import { MediaController } from './ui/media-controller.ts';
import { PresetController } from './ui/preset-controller.ts';

class SonificationApp {
  private pipeline = new SonificationPipeline();
  private presetManager = new PresetManager();
  private accountManager = new AccountManager();
  private audioEngine = new SoundCameraAudio();
  private cameraManager = new CameraManager();
  private videoRecorder = new VideoRecorder();
  private offlineVideoRecorder = new OfflineVideoRecorder();
  private isSyncMode = true;

  private activePreset!: SonificationPreset;

  // DOM Elements
  private canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private gpuQuery=new URLSearchParams(location.search);
  private gpuEnabled=shouldEnableTapeSatGpu(this.gpuQuery.get('gpu'),typeof navigator!=='undefined' && 'gpu' in navigator && !!navigator.gpu);
  private wasmEnabled=this.gpuQuery.get('gpu')==='wasm';
  private benchmarkEnabled=isAccelerationBenchmark(this.gpuQuery.get('gpu'));
  private gpuProfileEnabled=this.benchmarkEnabled && this.gpuQuery.get('gpu-profile')==='1';
  private gpuPerFrameValidation=(this.gpuQuery.get('gpu')==='tapesat' || this.gpuQuery.get('gpu')==='gpu-resident-rack') && this.gpuQuery.get('gpu-validation')!=='off';
  private gpuFusedApplyFinish=(this.gpuEnabled || this.gpuQuery.get('gpu')==='gpu-resident-rack') && this.gpuQuery.get('gpu-fused-apply')!=='off';
  private gpuCaptureMode:'auto'|'reference-bytes'=this.gpuQuery.get('gpu-capture')==='reference-bytes'?'reference-bytes':'auto';
  private gpu:AppTapeSatGpu | undefined;
  private gpuModuleLoad:Promise<void> | undefined;
  private gpuUnavailable=false;
  private videoTail:AppWebGpuVideoTail|undefined;
  private videoTailLoad:Promise<void>|undefined;
  private videoTailUnavailable=false;
  private residentFailureReason:string|undefined;
  private wasmRuntime:WasmDspRuntime | undefined;
  private offscreenCanvas = document.createElement('canvas');
  private offscreenCtx = this.offscreenCanvas.getContext('2d')!;
  private scopeCanvas = document.getElementById('scope-canvas') as HTMLCanvasElement;
  private scopeCtx = this.scopeCanvas?.getContext('2d');
  private hudCanvas = document.getElementById('hud-canvas') as HTMLCanvasElement;
  private hudOverlay!: HudOverlay;
  private btnToggleHud = document.getElementById('btn-toggle-hud') as HTMLButtonElement | null;
  private btnDrawerHud = document.getElementById('btn-drawer-hud') as HTMLButtonElement | null;
  private perfBadge = document.getElementById('perf-badge') as HTMLDivElement;

  private selectColorSpace = document.getElementById('select-colorspace') as HTMLSelectElement;
  private selectRawType = document.getElementById('select-rawtype') as HTMLSelectElement;
  private selectBitDepth = document.getElementById('select-bitdepth') as HTMLSelectElement;
  private selectLaw = document.getElementById('select-law') as HTMLSelectElement;
  private checkEqualize = document.getElementById('check-equalize') as HTMLInputElement;
  private resolutionSlider = createResolutionSlider(
    document.getElementById('slider-resolution-mount'),
    (res) => {
      this.mediaController.setResolution(res);
      this.requestRender();
    },
  );
  private inputPresetDesc = document.getElementById('input-preset-desc') as HTMLTextAreaElement;

  private statusResolution = document.getElementById('status-resolution');

  private customMobileHost = '';
  private pendingAccountSave = false;
  private pendingAccountPublish = false;

  // Audio Gain Rotary Knobs (Generated Synth & Input Source)
  private masterGainKnob!: RotaryKnob;
  private sourceGainKnob!: RotaryKnob;
  private currentMicStream: MediaStream | null = null;

  private inputImageBuffer: ImageData | null = null;
  private animFrameId: number | null = null;
  private videoFrameId: number | null = null;
  private frameVideo: HTMLVideoElement | null = null;
  private loopGeneration = 0;
  private cameraBusy = false;

  // Viewport Tab State
  private currentViewMode: 'developed' | 'exposure' | 'source' | 'scope' = 'developed';
  private lastTime = performance.now();
  private frameCount = 0;
  private currentFps = 0;
  private cachedImageData: ImageData | null = null;
  private processingFrame=false;
  private measureStart=0;
  private measureKey='';
  private sessionStart=0;
  private measuredWindowMs=0;
  private resetHistory:{atSeconds:number;reason:string}[]=[];
  private frameMeasurements:number[]=[];
  private stageMeasurements:{captureMs:number;prepareMs:number;gpuMs:number;audioMs:number;telemetryMs:number;otherMs:number}[]=[];
  private measuredGpuFrames=0;
  private measuredJsFrames=0;
  private measuredWasmFrames=0;
  private measuredVideoTailFrames=0;
  private measuredResidentFrames=0;
  private selectedRouteId='cpu-reference';
  private routeChanges:{atSeconds:number;routeId:string}[]=[];
  private currentRoutePlan:ApplicationRoutePlan|undefined;
  private missedCallbacks=0;
  private lastPresented:number | undefined;

  // Sub-controllers
  private qrModalController!: QrModalController;
  public filterLibraryModalController!: FilterLibraryModalController;
  private accountModalController!: AccountModalController;
  private rackController!: ChainRackController;
  private mobileController!: MobileController;
  private mediaController!: MediaController;
  private presetController!: PresetController;

  private stopFrameLoop(reason='unspecified'): void {
    const hadActiveLoop=this.frameVideo!==null || this.animFrameId!==null || this.videoFrameId!==null || this.processingFrame;
    if(!hadActiveLoop)return;
    this.loopGeneration++;
    this.gpu?.reset();
    this.videoTail?.reset();
    this.closeMeasuredWindow();
    if(this.sessionStart)this.resetHistory.push({atSeconds:(performance.now()-this.sessionStart)/1000,reason});
    this.measureStart=0;this.lastPresented=undefined;
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    if (this.videoFrameId !== null) this.frameVideo?.cancelVideoFrameCallback(this.videoFrameId);
    this.animFrameId = null;
    this.videoFrameId = null;
    this.frameVideo = null;
  }

  private scheduleFrame(video: HTMLVideoElement, callback: () => void): void {
    this.frameVideo = video;
    if (typeof video.requestVideoFrameCallback === 'function' && video.isConnected) {
      this.videoFrameId = video.requestVideoFrameCallback((_now,metadata)=>{
      if(this.benchmarkEnabled && this.measureStart && performance.now()>=this.measureStart && this.lastPresented!==undefined)this.missedCallbacks+=Math.max(0,metadata.presentedFrames-this.lastPresented-1);
        this.lastPresented=metadata.presentedFrames;callback();
      });
    } else {
      this.animFrameId = requestAnimationFrame(callback);
    }
  }

  private async flipCamera(): Promise<void> {
    if (this.cameraBusy || !this.cameraManager.isActive()) return;
    this.cameraBusy = true;
    this.stopFrameLoop('camera-facing-change');
    try {
      await this.cameraManager.toggleFacingMode();
      if (this.cameraManager.isActive()) this.startLiveLoop();
    } catch (error) {
      console.warn('Camera switch failed', error);
      alert('Camera switch failed. Tap START CAM to retry.');
    } finally {
      this.cameraBusy = false;
      this.updateCamToggleUI(this.cameraManager.isActive());
    }
  }

  constructor() {
    this.initPreset();
    this.initCanvasPlaceholder();
    this.initHudOverlay();
    this.initMasterKnob();
    this.initCollapsibleCards();
    this.initControllers();
    if(this.benchmarkEnabled){
      this.mediaController.setResolution('720p');this.resolutionSlider?.setValue('720p');
    }
    if(this.benchmarkEnabled){
      this.perfBadge.dataset.benchmarkBackend=this.gpuEnabled?'GPU-loading':this.wasmEnabled?'WASM-loading':'JS';
    }
    if(this.wasmEnabled){
      void import('./engine/backends/wasm.ts').then(async module=>{
        const runtime=await module.WasmDspRuntime.load();
        this.wasmRuntime=runtime;
        this.pipeline=new SonificationPipeline(runtime.createFilter,runtime.processSegment,runtime.getSampleBuffer);
        this.perfBadge.dataset.benchmarkBackend='WASM';
        this.requestRender();
      }).catch(error=>{
        this.perfBadge.dataset.benchmarkBackend='error';
        this.perfBadge.textContent=`WASM load failed: ${String(error)}`;
        console.error('Experimental WASM module unavailable',error);
      });
    }
    this.bindEvents();
    if(this.benchmarkEnabled){
      this.perfBadge.setAttribute('role','button');this.perfBadge.tabIndex=0;this.perfBadge.style.cursor='pointer';
      this.perfBadge.title='Benchmark session. Badge shows session and collected measurement time. Click to download cumulative results.';
      const download=()=>this.downloadApplicationReport();
      this.perfBadge.addEventListener('click',download);
      this.perfBadge.addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();download();}});
    }
    void this.resolveSharedPresetHash();

    const releaseCamera = () => {
      this.stopFrameLoop('page-hidden');
      this.cameraManager.stop();
      this.stopMicStream();
      this.updateCamToggleUI(false);
      const button = document.getElementById('btn-toggle-camera');
      if (button) button.textContent = 'Live camera';
    };
    window.addEventListener('pagehide', releaseCamera);
    window.addEventListener('pagehide',()=>this.audioEngine.dispose());
    window.addEventListener('pagehide',()=>this.wasmRuntime?.dispose());
    window.addEventListener('pagehide',()=>this.videoTail?.dispose());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseCamera();
      else if (this.mediaController?.getLoadedVideo()) this.mediaController.startVideoFileLoop();
    });
  }

  private initControllers(): void {
    this.rackController = new ChainRackController({
      getActivePreset: () => this.activePreset,
      onRequestRender: () => this.requestRender(),
    });

    this.filterLibraryModalController = new FilterLibraryModalController({
      onAddAudioFilter: (type) => this.rackController.addAudioFilter(type),
      onAddVideoFilter: (type) => this.rackController.addVideoFilter(type),
    });

    this.qrModalController = new QrModalController({
      presetManager: this.presetManager,
      getActivePreset: () => this.activePreset,
      getCustomHost: () => this.customMobileHost,
      setCustomHost: (host) => { this.customMobileHost = host; },
      getShareBaseUrl: () => this.getShareBaseUrl(),
      isSavedByCurrentUser: () => {
        const id = this.presetController?.getSavedPresetId();
        const owner = this.presetController?.getSavedPresetOwnerId();
        return !!id && owner === this.accountManager.userId;
      },
      onPublishClick: async () => {
        const id = this.presetController?.getSavedPresetId();
        const owner = this.presetController?.getSavedPresetOwnerId();
        if (!id || owner !== this.accountManager.userId) {
          if (!this.accountManager.userId) {
            this.pendingAccountSave = true;
            this.pendingAccountPublish = true;
            this.accountModalController.open('login');
            this.accountModalController.setMessage('Log in or create an account to publish this preset.');
            return;
          }
          await this.presetController.saveActivePreset(false);
          if (!this.presetController.getSavedPresetId()) return;
        }
        try {
          await this.presetController.publishSavedPreset();
        } catch (error) {
          this.showPresetNotice((error as Error).message, true);
        }
      },
      onShowNotice: (msg, error) => this.showPresetNotice(msg, error),
    });

    this.accountModalController = new AccountModalController({
      accountManager: this.accountManager,
      onAuthStateChanged: () => {
        this.presetController?.renderPresetDropdown();
        this.presetController?.updatePresetButtonsState();
        if (this.accountManager.userId) void this.presetController?.loadPresetLibrary();
      },
      getPendingAccountSave: () => this.pendingAccountSave,
      setPendingAccountSave: (val) => { this.pendingAccountSave = val; },
      getPendingAccountPublish: () => this.pendingAccountPublish,
      setPendingAccountPublish: (val) => { this.pendingAccountPublish = val; },
      executePendingSaveAndPublish: async () => {
        await this.presetController.saveActivePreset(false);
        if (this.presetController.getSavedPresetId() && this.presetController.getSavedPresetOwnerId() === this.accountManager.userId) {
          await this.presetController.publishSavedPreset();
        }
      },
      executePendingSaveOnly: async () => {
        await this.presetController.saveActivePreset(false);
      },
    });

    this.presetController = new PresetController({
      presetManager: this.presetManager,
      accountManager: this.accountManager,
      getActivePreset: () => this.activePreset,
      setActivePreset: (preset, saved) => this.applyPreset(preset, saved),
      onPresetChanged: () => {
        this.syncFormWithPreset();
        this.rackController?.render();
        this.mobileController?.renderPresetDrawer();
        this.mobileController?.updatePresetBadge();
      },
      onOpenAccountModal: (mode) => this.accountModalController.open(mode),
      onShowQrForHash: (hash) => this.qrModalController.showQrForHash(hash),
      onShowNotice: (msg, err) => this.showPresetNotice(msg, err),
      onRequestRender: () => this.requestRender(),
      onBusRateChanged: (rate) => {
        this.audioEngine.setSampleRate(rate);
        this.hudOverlay?.setTelemetryData({ sampleRate: rate });
      },
    });

    this.mediaController = new MediaController({
      canvas: this.canvas,
      measureSourceHash:this.benchmarkEnabled,
      resumeLiveCamera:()=>this.startLiveLoop(),
      offscreenCanvas: this.offscreenCanvas,
      offscreenCtx: this.offscreenCtx,
      pipeline: this.pipeline,
      videoRecorder: this.videoRecorder,
      offlineVideoRecorder: this.offlineVideoRecorder,
      audioEngine: this.audioEngine,
      cameraManager: this.cameraManager,
      getActivePreset: () => this.activePreset,
      getBusRate: () => this.presetController.getCurrentBusRate(),
      getIsSyncMode: () => this.isSyncMode,
      isMobileDevice: () => this.mobileController ? this.mobileController.isMobileDevice() : false,
      isFrameProcessing: () => this.processingFrame,
      onFrameProcessed: (captureInput,started,capturedAt) => {
        return this.processAndBlit(started,capturedAt,captureInput);
      },
      onCameraStopped: () => {
        this.stopMicStream();
        const btnCam = document.getElementById('btn-toggle-camera');
        if (btnCam) {
          btnCam.textContent = 'Live camera';
          btnCam.classList.remove('btn-hw-primary');
        }
        document.getElementById('btn-flip-camera')?.classList.add('hidden');
      },
      scheduleFrame: (v, cb) => this.scheduleFrame(v, cb),
      stopFrameLoop: reason => this.stopFrameLoop(reason),
      getLoopGeneration: () => this.loopGeneration,
    });

    this.mobileController = new MobileController({
      audioEngine: this.audioEngine,
      presetManager: this.presetManager,
      getActivePreset: () => this.activePreset,
      setActivePreset: (p) => this.applyPreset(p),
      onPresetChanged: () => {
        this.syncFormWithPreset();
        this.presetController.renderPresetDropdown();
        this.rackController.render();
        this.requestRender();
      },
      onToggleCamera: () => this.toggleLiveCameraFeed(),
      onStartCamera: () => this.startLiveCameraFeed(),
      onFlipCamera: () => this.flipCamera(),
      onTriggerShutter: () => this.mediaController.triggerShutterSnapshot(),
      onToggleRecording: () => this.mediaController.toggleVideoRecording(),
      onSetResolution: (res) => {
        this.mediaController.setResolution(res);
        this.resolutionSlider?.setValue(res);
        this.requestRender();
      },
      onVolumeChange: (vol) => {
        if (this.masterGainKnob) this.masterGainKnob.setValue(vol);
        const desktopVol = document.getElementById('slider-volume') as HTMLInputElement | null;
        if (desktopVol) desktopVol.value = String(vol);
      },
      onSourceVolumeChange: (vol) => {
        if (this.sourceGainKnob) this.sourceGainKnob.setValue(vol);
        const desktopSrcVol = document.getElementById('slider-source-volume') as HTMLInputElement | null;
        if (desktopSrcVol) desktopSrcVol.value = String(vol);
      },
      onModeChanged: (mode) => {
        if (mode === 'scope') {
          this.hudOverlay?.setEnabled(true);
          this.hudOverlay?.resize();
          this.requestRender();
        } else if (document.body.classList.contains('is-fullscreen') || window.innerWidth <= 900) {
          this.hudOverlay?.setEnabled(false);
          this.requestRender();
        }
      },
    });
  }

  private initHudOverlay(): void {
    const wrap = document.querySelector('.hud-bay-canvas-wrap') as HTMLElement;
    if (this.hudCanvas && wrap) {
      const hudOverride=this.gpuQuery.get('gpu-hud');
      const enabledOverride=hudOverride==='on'?true:hudOverride==='off'?false:undefined;
      this.hudOverlay = new HudOverlay(wrap, this.hudCanvas, enabledOverride);
      this.updateHudToggleUI();

      this.btnToggleHud?.addEventListener('click', () => {
        this.hudOverlay.toggle();
        this.updateHudToggleUI();
        this.requestRender();
      });

      this.btnDrawerHud?.addEventListener('click', () => {
        this.hudOverlay.toggle();
        this.updateHudToggleUI();
        this.requestRender();
      });
    }
  }

  private updateHudToggleUI(): void {
    if (!this.hudOverlay) return;
    const isEnabled = this.hudOverlay.isEnabled();

    const hudBay = document.getElementById('telemetry-hud-bay');
    if (hudBay) {
      hudBay.classList.toggle('is-hidden', !isEnabled);
    }

    if (this.btnToggleHud) {
      this.btnToggleHud.classList.toggle('active', isEnabled);
      const text = document.getElementById('hud-btn-text');
      if (text) text.textContent = isEnabled ? 'HUD' : 'NO HUD';
    }

    if (this.btnDrawerHud) {
      this.btnDrawerHud.classList.toggle('btn-hw-primary', isEnabled);
      this.btnDrawerHud.classList.toggle('btn-hw-secondary', !isEnabled);
      this.btnDrawerHud.textContent = isEnabled ? 'RETICLE HUD: ACTIVE' : 'RETICLE HUD: OFF';
    }
  }

  private initPreset(): void {
    let hashPreset: SonificationPreset | null = null;
    try {
      const decoded = this.presetManager.decodePresetFromHash(window.location.hash);
      if (decoded) hashPreset = validatePreset(decoded);
    } catch (error) {
      console.warn('Shared preset link is invalid; loading a default.', error);
    }
    if (hashPreset) {
      this.activePreset = hashPreset;
    } else if(this.benchmarkEnabled){
      const stream={rawType:'INTERLEAVED',law:'NONE',sign:'UNSIGNED',bits:8,endianess:'LITTLE_ENDIAN',colorSpace:'RGB'} as const;
      this.activePreset={
        id:'experimental-gpu-tapesat',name:'Experimental GPU TapeSat',
        description:'Single-filter TapeSat preset for the opt-in 720p WebGPU path.',
        reader:{...stream},writer:{...stream},equalize:false,blendMode:'NONE',blendAmount:0,
        filters:[{id:'gpu-tapesat',type:'tapesat',enabled:true,sampleRate:44100,params:{drive:2.5,bias:0.1,bump:0.4,bumpHz:80,tone:8000}}],
        videoFilters:[],
      };
    } else {
      this.activePreset = JSON.parse(JSON.stringify(this.presetManager.getAllPresets()[0]));
    }
    this.syncFormWithPreset();
  }

  private initCanvasPlaceholder(): void {
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.offscreenCanvas.width = 640;
    this.offscreenCanvas.height = 480;
    const grad = this.offscreenCtx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, '#0d130e');
    grad.addColorStop(0.5, '#2a3b26');
    grad.addColorStop(1, '#c8d665');
    this.offscreenCtx.fillStyle = grad;
    this.offscreenCtx.fillRect(0, 0, 640, 480);
    this.inputImageBuffer = this.offscreenCtx.getImageData(0, 0, 640, 480);
    this.requestRender();
  }

  private initMasterKnob(): void {
    const slot = document.getElementById('master-knob-slot') || document.getElementById('master-gain-knob-slot');
    if (slot) {
      this.masterGainKnob = new RotaryKnob({
        min: 0,
        max: 1.0,
        step: 0.01,
        value: 0.01,
        defaultValue: 0.01,
        label: 'SYNTH',
        tooltip: 'Generated Sonification Volume Level [Range: 0.0 to 1.0]',
        size: 38,
        onChange: (val) => {
          this.audioEngine.setVolume(val);
          const mobileVol = document.getElementById('mobile-slider-volume') as HTMLInputElement | null;
          if (mobileVol) {
            mobileVol.value = String(val);
          }
          const desktopVol = document.getElementById('slider-volume') as HTMLInputElement | null;
          if (desktopVol) {
            desktopVol.value = String(val);
          }
        },
      });
      slot.appendChild(this.masterGainKnob.element);
      this.audioEngine.setVolume(0.01);
    }

    const srcSlot = document.getElementById('source-knob-slot');
    if (srcSlot) {
      this.sourceGainKnob = new RotaryKnob({
        min: 0,
        max: 1.0,
        step: 0.01,
        value: 0.7,
        defaultValue: 0.7,
        label: 'SOURCE',
        tooltip: 'Source Audio Level (Video / Microphone) [Range: 0.0 to 1.0]',
        size: 38,
        onChange: (val) => {
          this.audioEngine.setInputVolume(val);
          const mobileSrcVol = document.getElementById('mobile-slider-source-volume') as HTMLInputElement | null;
          if (mobileSrcVol) {
            mobileSrcVol.value = String(val);
          }
          const desktopSrcVol = document.getElementById('slider-source-volume') as HTMLInputElement | null;
          if (desktopSrcVol) {
            desktopSrcVol.value = String(val);
          }
        },
      });
      srcSlot.appendChild(this.sourceGainKnob.element);
      this.audioEngine.setInputVolume(0.7);
    }
  }

  private syncFormWithPreset(): void {
    if (this.selectColorSpace) this.selectColorSpace.value = this.activePreset.reader.colorSpace;
    if (this.selectRawType) this.selectRawType.value = this.activePreset.reader.rawType;
    if (this.selectBitDepth) this.selectBitDepth.value = String(this.activePreset.reader.bits);
    if (this.selectLaw) this.selectLaw.value = this.activePreset.reader.law;
    if (this.checkEqualize) this.checkEqualize.checked = this.activePreset.equalize;
    if (this.inputPresetDesc) {
      this.inputPresetDesc.value = this.activePreset.description || '';
    }
    this.presetController?.updateEditorialHeaders();
    this.presetController?.updatePresetButtonsState();
  }

  private async resolveSharedPresetHash(): Promise<void> {
    const hash = window.location.hash;
    if (!hash.startsWith('#shared=')) return;
    const id = hash.slice(8).slice(0, 64);
    try {
      const preset = await this.accountManager.getPublic(id);
      if (window.location.hash !== hash) return;
      this.applyPreset(preset);
      this.showPresetNotice('Shared preset applied.');
    } catch (error) {
      if (window.location.hash !== hash) return;
      this.showPresetNotice(`Shared preset unavailable: ${(error as Error).message}`, true);
    }
  }

  private applyPreset(preset: SonificationPreset, saved?: StoredPreset): void {
    this.activePreset = JSON.parse(JSON.stringify(validatePreset(preset)));
    this.presetController.setSavedPresetMeta(saved?.id || null, saved?.owner || null);
    this.syncFormWithPreset();
    this.rackController.render();
    this.presetController.renderPresetDropdown();
    this.mobileController?.updatePresetBadge();
    this.requestRender();
  }

  private showPresetNotice(message: string, error = false): void {
    const notice = document.getElementById('app-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.classList.remove('hidden', 'error');
    if (error) notice.classList.add('error');
    window.clearTimeout((this as any)._noticeTimer);
    (this as any)._noticeTimer = window.setTimeout(() => {
      notice.classList.add('hidden');
    }, 3600);
  }

  private getShareBaseUrl(): string {
    const configuredOrigin = (import.meta.env.VITE_SITE_URL || '').replace(/\/+$/, '');
    if (configuredOrigin) {
      const path = (typeof window !== 'undefined' && window.location ? window.location.pathname : '/');
      return `${configuredOrigin}${path}`;
    }
    const isLocal = typeof window !== 'undefined' && window.location && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocal && !this.customMobileHost) throw new Error('Enter your computer’s Wi-Fi address to make a phone link.');
    if (this.customMobileHost) return `https://${this.customMobileHost}${window.location.pathname}`;
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://sonification.vasily.onl';
    const path = typeof window !== 'undefined' && window.location ? window.location.pathname : '/';
    return `${origin}${path}`.replace(/^http:\/\//, 'https://');
  }

  private bindEvents(): void {
    // Viewport tabs
    const vtabs = document.querySelectorAll('.vtab');
    vtabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        vtabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentViewMode = tab.getAttribute('data-view') as any;
        if (this.currentViewMode === 'scope') {
          this.scopeCanvas?.classList.remove('hidden');
        } else {
          this.scopeCanvas?.classList.add('hidden');
        }
        this.requestRender();
      });
    });

    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
      this.initCanvasPlaceholder();
    });

    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      const current = this.mobileController.getIsFullscreen();
      this.mobileController.setFullscreenMode(!current, true);
    });

    document.addEventListener('fullscreenchange', () => {
      const isNativeFs = !!document.fullscreenElement;
      if (!isNativeFs && !this.mobileController.isMobileDevice()) {
        this.mobileController.setFullscreenMode(false, false);
      }
    });

    const btnHeroSeed = document.getElementById('btn-hero-seed');
    if (btnHeroSeed) {
      btnHeroSeed.onclick = () => {
        const randomSeed = Math.floor(1000 + Math.random() * 9000);
        this.presetController.applySeed(randomSeed);
      };
    }

    const btnHeroBus = document.getElementById('btn-hero-bus');
    if (btnHeroBus) {
      btnHeroBus.onclick = () => {
        this.presetController.cycleBusRate();
      };
    }

    const presetTrigger = document.getElementById('preset-display-trigger');
    if (presetTrigger) {
      presetTrigger.addEventListener('click', () => {
        this.presetController.openPresetLibrary('mine');
      });
    }

    if (this.inputPresetDesc) {
      this.inputPresetDesc.oninput = () => {
        this.activePreset.description = this.inputPresetDesc.value;
        const fieldNoteDesc = document.getElementById('field-note-desc');
        if (fieldNoteDesc) fieldNoteDesc.textContent = this.activePreset.description;
        this.presetController.updatePresetButtonsState();
      };
    }

    document.getElementById('btn-export-series')?.addEventListener('click', () => {
      const data = new Blob([JSON.stringify([this.activePreset], null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(data);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `sonification_preset_${Date.now()}.json`;
      downloadAnchor.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btn-import-series')?.addEventListener('click', () => {
      if (!this.accountManager.userId) {
        this.accountModalController.open('login');
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const imported = JSON.parse(event.target?.result as string);
              if (Array.isArray(imported)) {
                void Promise.all(imported.map(async (raw: unknown) => {
                  const preset = validatePreset(raw);
                  preset.id = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                  await this.accountManager.save(preset);
                })).then(() => alert(`Successfully imported ${imported.length} studies!`)).catch(error => alert(`Import failed: ${(error as Error).message}`));
              }
            } catch (err) {
              alert('Could not parse imported JSON series file.');
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    });

    if (this.selectColorSpace) {
      this.selectColorSpace.onchange = () => {
        this.activePreset.reader.colorSpace = this.selectColorSpace.value as ColorSpace;
        this.activePreset.writer.colorSpace = this.selectColorSpace.value as ColorSpace;
        this.requestRender();
      };
    }

    if (this.selectRawType) {
      this.selectRawType.onchange = () => {
        this.activePreset.reader.rawType = this.selectRawType.value as RawType;
        this.activePreset.writer.rawType = this.selectRawType.value as RawType;
        this.requestRender();
      };
    }

    if (this.selectBitDepth) {
      this.selectBitDepth.onchange = () => {
        const bits = parseInt(this.selectBitDepth.value, 10) as 8 | 16 | 24;
        this.activePreset.reader.bits = bits;
        this.activePreset.writer.bits = bits;
        this.requestRender();
      };
    }

    if (this.selectLaw) {
      this.selectLaw.onchange = () => {
        this.activePreset.reader.law = this.selectLaw.value as CompandingLaw;
        this.activePreset.writer.law = this.selectLaw.value as CompandingLaw;
        this.requestRender();
      };
    }

    if (this.checkEqualize) {
      this.checkEqualize.onchange = () => {
        this.activePreset.equalize = this.checkEqualize.checked;
        this.requestRender();
      };
    }

    // Modal triggers
    const openAboutModal = () => {
      document.getElementById('about-modal')?.classList.remove('hidden');
    };
    const closeAboutModal = () => {
      document.getElementById('about-modal')?.classList.add('hidden');
    };

    document.getElementById('btn-about')?.addEventListener('click', openAboutModal);
    document.getElementById('btn-about-modal')?.addEventListener('click', openAboutModal);
    document.getElementById('btn-close-about')?.addEventListener('click', closeAboutModal);

    const aboutModal = document.getElementById('about-modal');
    aboutModal?.addEventListener('click', (e) => {
      if (e.target === aboutModal) {
        closeAboutModal();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('about-modal');
        if (modal && !modal.classList.contains('hidden')) {
          closeAboutModal();
        }
      }
      if (e.code === 'Space' && (e.target === document.body || (e.target as HTMLElement).tagName === 'BUTTON')) {
        if (this.mediaController.getLoadedVideo()) {
          e.preventDefault();
          this.mediaController.toggleVideoPlayPause();
        }
      }
    });

    document.getElementById('btn-qr-modal')?.addEventListener('click', () => {
      void this.qrModalController.openWithCurrentPreset();
    });

    window.addEventListener('hashchange', () => {
      if (window.location.hash.startsWith('#shared=')) {
        void this.resolveSharedPresetHash();
        return;
      }
      const hashPreset = this.presetManager.decodePresetFromHash(window.location.hash);
      if (hashPreset) {
        try { this.applyPreset(validatePreset(hashPreset)); }
        catch (error) { this.showPresetNotice((error as Error).message, true); }
      }
    });

    // Randomizers
    document.getElementById('btn-random-params')?.addEventListener('click', () => {
      for (const f of this.activePreset.filters) {
        const desc = FILTER_DESCRIPTORS[f.type];
        if (desc) {
          for (const p of desc.params) {
            f.params[p.name] = p.min + Math.random() * (p.max - p.min);
          }
        }
      }
      if (this.activePreset.videoFilters) {
        for (const vf of this.activePreset.videoFilters) {
          const desc = VIDEO_FILTER_DESCRIPTORS[vf.type];
          if (desc) {
            for (const p of desc.params) {
              vf.params[p.name] = p.min + Math.random() * (p.max - p.min);
            }
          }
        }
      }
      this.rackController.render();
      this.requestRender();
    });

    document.getElementById('btn-random-stream')?.addEventListener('click', () => {
      const csList: ColorSpace[] = ['RGB', 'LAB', 'LUV', 'HCL', 'XYZ', 'YXY', 'CMY', 'OHTA'];
      const rawList: RawType[] = ['PLANAR', 'INTERLEAVED'];
      const bitList: (8 | 16 | 24)[] = [8, 16, 24];
      const lawList: CompandingLaw[] = ['A_LAW', 'U_LAW', 'NONE'];

      this.activePreset.reader.colorSpace = csList[Math.floor(Math.random() * csList.length)];
      this.activePreset.writer.colorSpace = this.activePreset.reader.colorSpace;
      this.activePreset.reader.rawType = rawList[Math.floor(Math.random() * rawList.length)];
      this.activePreset.writer.rawType = this.activePreset.reader.rawType;
      this.activePreset.reader.bits = bitList[Math.floor(Math.random() * bitList.length)];
      this.activePreset.writer.bits = this.activePreset.reader.bits;
      this.activePreset.reader.law = lawList[Math.floor(Math.random() * lawList.length)];
      this.activePreset.writer.law = this.activePreset.reader.law;

      this.syncFormWithPreset();
      this.requestRender();
    });

    document.getElementById('btn-random-filters')?.addEventListener('click', () => {
      type ModuleChoice = { kind: 'audio'; type: FilterId } | { kind: 'video'; type: VideoFilterId };
      const audioTypes = (Object.keys(FILTER_DESCRIPTORS) as FilterId[]).map(
        (type): ModuleChoice => ({ kind: 'audio', type }),
      );
      const videoTypes = (Object.keys(VIDEO_FILTER_DESCRIPTORS) as VideoFilterId[]).map(
        (type): ModuleChoice => ({ kind: 'video', type }),
      );
      const allModules: ModuleChoice[] = [...audioTypes, ...videoTypes];

      const count = Math.floor(1 + Math.random() * 4);
      this.activePreset.filters = [];
      this.activePreset.videoFilters = [];
      this.activePreset.chain = [];

      for (let i = 0; i < count; i++) {
        const choice = allModules[Math.floor(Math.random() * allModules.length)];
        if (choice.kind === 'audio') {
          const desc = FILTER_DESCRIPTORS[choice.type];
          const params: Record<string, number> = {};
          for (const p of desc.params) {
            params[p.name] = p.min + Math.random() * (p.max - p.min);
          }
          const id = 'f_' + Math.random().toString(36).substring(2, 7);
          this.activePreset.filters.push({
            id,
            type: choice.type,
            enabled: true,
            sampleRate: 44100,
            params,
          });
          this.activePreset.chain.push({ kind: 'audio', id });
        } else {
          const desc = VIDEO_FILTER_DESCRIPTORS[choice.type];
          const params: Record<string, number> = {};
          for (const p of desc.params) {
            params[p.name] = p.min + Math.random() * (p.max - p.min);
          }
          const id = 'vf_' + Math.random().toString(36).substring(2, 7);
          this.activePreset.videoFilters.push({
            id,
            type: choice.type,
            enabled: true,
            params,
          });
          this.activePreset.chain.push({ kind: 'video', id });
        }
      }

      this.rackController.render();
      this.requestRender();
    });

    // File input (Image)
    const fileInput = document.getElementById('input-file') as HTMLInputElement;
    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) this.mediaController.loadImageFromFile(file);
      };
    }

    // File input (Video)
    const videoFileInput = document.getElementById('input-video-file') as HTMLInputElement;
    if (videoFileInput) {
      videoFileInput.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) this.mediaController.loadVideoFromFile(file);
      };
    }

    // Drag and drop image or video
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        if (file.type.startsWith('video/')) {
          this.mediaController.loadVideoFromFile(file);
        } else if (file.type.startsWith('image/')) {
          this.mediaController.loadImageFromFile(file);
        }
      }
    });

    // Camera toggle
    const btnCamera = document.getElementById('btn-toggle-camera') as HTMLButtonElement;
    const btnFlipCamera = document.getElementById('btn-flip-camera') as HTMLButtonElement;
    if (btnCamera) btnCamera.onclick = () => { void this.toggleLiveCameraFeed(); };
    if (btnFlipCamera) btnFlipCamera.onclick = () => { void this.flipCamera(); };

    // Audio controls
    const btnAudio = document.getElementById('btn-toggle-audio') as HTMLButtonElement;
    const audioLabel = document.getElementById('audio-btn-label');
    if (btnAudio) {
      btnAudio.onclick = () => {
        this.audioEngine.init();
        const isMuted = !this.audioEngine.getMuted();
        this.audioEngine.setMuted(isMuted);
        if (audioLabel) {
          audioLabel.textContent = isMuted ? 'AUDIO: MUTED' : 'AUDIO: ENGAGED';
        }
        btnAudio.classList.toggle('active', !isMuted);
      };
    }

    const sliderVol = document.getElementById('slider-volume') as HTMLInputElement | null;
    if (sliderVol) {
      sliderVol.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        this.audioEngine.setVolume(val);
        if (this.masterGainKnob) this.masterGainKnob.setValue(val);
        const mobileVol = document.getElementById('mobile-slider-volume') as HTMLInputElement | null;
        if (mobileVol) mobileVol.value = String(val);
      });
    }

    const sliderSourceVol = document.getElementById('slider-source-volume') as HTMLInputElement | null;
    if (sliderSourceVol) {
      sliderSourceVol.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        this.audioEngine.setInputVolume(val);
        if (this.sourceGainKnob) this.sourceGainKnob.setValue(val);
        const mobileSrcVol = document.getElementById('mobile-slider-source-volume') as HTMLInputElement | null;
        if (mobileSrcVol) mobileSrcVol.value = String(val);
      });
    }

    // Shutter Trigger Button
    document.getElementById('btn-shutter')?.addEventListener('click', () => {
      this.mediaController.triggerShutterSnapshot();
    });

    // Hardware SYNC Toggle
    const btnSync = document.getElementById('btn-sync-mode') as HTMLButtonElement;
    const syncText = document.getElementById('sync-btn-text');
    if (btnSync) {
      btnSync.onclick = () => {
        this.isSyncMode = !this.isSyncMode;
        btnSync.classList.toggle('active', this.isSyncMode);
        if (syncText) {
          syncText.textContent = this.isSyncMode ? 'SYNC' : 'SYNC OFF';
        }
        btnSync.title = this.isSyncMode
          ? 'Recording Sync: ON (Real-Time Live) — Click to switch to Offline Frame Render'
          : 'Recording Sync: OFF (Offline Frame-by-Frame Render for Video Files) — Click to switch to Real-Time';
      };
    }

    const btnCancelRender = document.getElementById('btn-cancel-render') as HTMLButtonElement;
    if (btnCancelRender) {
      btnCancelRender.onclick = () => {
        if (this.offlineVideoRecorder.getIsRunning()) {
          this.offlineVideoRecorder.cancel();
        }
      };
    }

    const btnRec = document.getElementById('btn-record-video') as HTMLButtonElement;
    if (btnRec) {
      btnRec.onclick = () => { void this.mediaController.toggleVideoRecording(); };
    }
  }

  private initCollapsibleCards(): void {
    const cards = document.querySelectorAll('.collapsible-card');
    cards.forEach((card) => {
      const header = card.querySelector('.rack-card-header');
      if (header) {
        header.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button:not(.btn-collapse-toggle), select, input, label')) {
            return;
          }
          card.classList.toggle('is-collapsed');
        });
      }
    });
  }

  private updateCamToggleUI(isActive: boolean): void {
    this.mobileController?.updateCamToggleUI(isActive);
  }

  private stopMicStream(): void {
    if (this.currentMicStream) {
      try {
        this.currentMicStream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      this.currentMicStream = null;
    }
    this.audioEngine.detachMediaStream();
  }

  private async startLiveCameraFeed(): Promise<boolean> {
    if (this.cameraBusy || document.hidden) return false;
    this.cameraBusy = true;
    try {
      this.mediaController?.stopVideoFile();
      await this.cameraManager.start(1920, 1080);
      if (!this.cameraManager.isActive() || document.hidden) return false;

      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.currentMicStream = micStream;
          this.audioEngine.attachMediaStream(micStream);
        } catch (err) {
          console.warn('Microphone feed unavailable in live mode:', err);
        }
      }

      this.startLiveLoop();
      this.updateCamToggleUI(true);

      const btnCam = document.getElementById('btn-toggle-camera');
      if (btnCam) {
        btnCam.textContent = 'Stop camera';
        btnCam.classList.add('btn-hw-primary');
      }
      document.getElementById('btn-flip-camera')?.classList.remove('hidden');
      return true;
    } catch (e) {
      console.warn('Could not auto-start camera:', e);
      this.updateCamToggleUI(false);
      if ((e as Error).name !== 'AbortError') alert(`Camera could not start: ${(e as Error).message}`);
      return false;
    } finally {
      this.cameraBusy = false;
    }
  }

  private async toggleLiveCameraFeed(): Promise<void> {
    if (this.cameraBusy) return;
    if (this.cameraManager.isActive()) {
      this.stopFrameLoop('camera-stopped');
      this.cameraManager.stop();
      this.stopMicStream();
      this.updateCamToggleUI(false);
      const btnCam = document.getElementById('btn-toggle-camera');
      if (btnCam) {
        btnCam.textContent = 'Live camera';
        btnCam.classList.remove('btn-hw-primary');
      }
      document.getElementById('btn-flip-camera')?.classList.add('hidden');
      this.initCanvasPlaceholder();
    } else {
      await this.startLiveCameraFeed();
    }
  }

  private startLiveLoop(): void {
    this.stopFrameLoop('live-loop-start');
    const generation = this.loopGeneration;

    const onFrame = async () => {
      if (generation !== this.loopGeneration || !this.cameraManager.isActive()) return;

      const video = this.cameraManager.getVideoElement();
      // Register the next presentation callback before awaiting GPU/audio work.
      // This keeps sampling aligned with the source clock without queuing frame
      // processing; processAndBlit remains single-flight and drops busy frames.
      this.scheduleFrame(video, onFrame);
      if (this.processingFrame) return;
      if (video.readyState >= 2) {
        const dims = this.mediaController.getTargetDimensions(video.videoWidth || 640, video.videoHeight || 480);
        if (this.offscreenCanvas.width !== dims.w || this.offscreenCanvas.height !== dims.h) {
          this.offscreenCanvas.width = dims.w;
          this.offscreenCanvas.height = dims.h;
        }
        if (this.canvas.width !== dims.w || this.canvas.height !== dims.h) {
          this.canvas.width = dims.w;
          this.canvas.height = dims.h;
        }

        const started=performance.now();
        this.offscreenCtx.drawImage(video, 0, 0, dims.w, dims.h);
        const capturedAt=performance.now();
        const captureInput=()=>{const captureStarted=performance.now();const data=this.offscreenCtx.getImageData(0,0,dims.w,dims.h);this.inputImageBuffer=data;return {data,durationMs:performance.now()-captureStarted};};
        await this.processAndBlit(started,capturedAt,captureInput);
      }

    };

    const video = this.cameraManager.getVideoElement();
    this.scheduleFrame(video, onFrame);
  }

  private requestRender(): void {
    if (!this.cameraManager.isActive() && !this.mediaController?.getLoadedVideo()) {
      requestAnimationFrame(() => this.processAndBlit());
    }
  }

  private async processAndBlit(started=performance.now(),capturedAt=started,captureInput=()=>({data:this.inputImageBuffer!,durationMs:0})): Promise<void> {
    if(this.processingFrame)return;
    this.processingFrame=true;
    try{await this.processCapturedFrame(started,capturedAt,captureInput);}finally{this.processingFrame=false;}
  }
  private async ensureGpuBackend(force=false):Promise<AppTapeSatGpu | undefined>{
    if(this.gpu || this.gpuUnavailable || (!this.gpuEnabled&&!force))return this.gpu;
    this.gpuModuleLoad??=import('./engine/backends/app-tapesat.ts').then(module=>{
      this.gpu=new module.AppTapeSatGpu(this.canvas,this.gpuProfileEnabled,this.gpuPerFrameValidation,this.gpuFusedApplyFinish,this.gpuCaptureMode);
    }).catch(error=>{
      this.gpuUnavailable=true;
      console.warn('GPU TapeSat module unavailable; continuing with JavaScript',error);
    });
    await this.gpuModuleLoad;
    return this.gpu;
  }
  private async ensureVideoTail():Promise<AppWebGpuVideoTail|undefined>{
    if(this.videoTail||this.videoTailUnavailable||!navigator.gpu)return this.videoTail;
    this.videoTailLoad??=import('./engine/backends/app-webgpu-video-tail.ts').then(module=>{this.videoTail=new module.AppWebGpuVideoTail(this.canvas,()=>this.gpu?.sharedDevice);}).catch(error=>{
      this.videoTailUnavailable=true;console.warn('GPU video-tail module unavailable; continuing with CPU',error);
    });
    await this.videoTailLoad;return this.videoTail;
  }
  private async processCapturedFrame(started:number,capturedAt:number,captureInput:()=>{data:ImageData;durationMs:number}):Promise<void> {
    if(this.benchmarkEnabled && this.wasmEnabled && !this.wasmRuntime)return;
    if(this.gpuEnabled && this.offlineVideoRecorder.getIsRunning())return;
    const generation=this.loopGeneration;
    let input:ImageData|undefined;
    let captureReadMs=0;
    const getInput=()=>{if(!input){const captured=captureInput();input=captured.data;this.inputImageBuffer=input;captureReadMs=captured.durationMs;}return input;};

    const w = this.canvas.width;
    const h = this.canvas.height;

    if (this.statusResolution) {
      this.statusResolution.textContent = `MODEL RESOLUTION ${w} × ${h}`;
    }

    if (this.currentViewMode === 'source') {
      this.gpu?.showCpu();
      this.videoTail?.showCpu();
      this.ctx.putImageData(getInput(), 0, 0);
      return;
    }

    const routeOverride=this.gpuQuery.get('gpu');
    const preset=this.gpuEnabled || routeOverride==='cpu-gpu-video-tail' || routeOverride==='gpu-resident-rack' ? structuredClone(this.activePreset) : this.activePreset;
    const eligible=this.currentViewMode==='developed' && this.isSyncMode && !this.videoRecorder.getIsRecording() && !this.offlineVideoRecorder.getIsRunning() &&
      (this.cameraManager.isActive() || !!this.mediaController?.getLoadedVideo()) && (this.presetController?.getCurrentBusRate()||44100)===44100 ? eligibleTapeSat(preset,w,h) : undefined;
    const requestedRoute=routeOverride==='js'?'cpu-reference':routeOverride==='wasm'?'wasm-cpu':routeOverride==='tapesat'?'gpu-tapesat':routeOverride==='cpu-gpu-video-tail'?'cpu-gpu-video-tail':routeOverride==='gpu-resident-rack'?'gpu-resident-rack':'auto';
    const routeFileSource=!!this.mediaController?.getLoadedVideo()&&this.currentViewMode==='developed'&&this.isSyncMode&&!this.videoRecorder.getIsRecording()&&!this.offlineVideoRecorder.getIsRunning()&&(this.presetController?.getCurrentBusRate()||44100)===44100;
    let routePlan=planApplicationRoute({requested:requestedRoute as 'auto'|'cpu-reference'|'gpu-tapesat'|'cpu-gpu-video-tail'|'gpu-resident-rack'|'wasm-cpu',preset,width:w,height:h,
      webGpuAvailable:typeof navigator!=='undefined'&&!!navigator.gpu,
      videoTailAvailable:!this.videoTailUnavailable&&routeFileSource,fileVideo:routeFileSource,cameraActive:this.cameraManager.isActive()});
    if(requestedRoute==='gpu-resident-rack'&&this.residentFailureReason)routePlan={...routePlan,selectedRouteId:'cpu-reference',cpuPrefixNodeIds:routePlan.activeNodeIds.slice(),videoSuffixNodeIds:[],fallbackReason:this.residentFailureReason};
    this.currentRoutePlan=routePlan;
    this.perfBadge.dataset.benchmarkRoute=routePlan.selectedRouteId;
    if(routePlan.fallbackReason)this.perfBadge.dataset.benchmarkFallbackReason=routePlan.fallbackReason;
    else delete this.perfBadge.dataset.benchmarkFallbackReason;
    if(routePlan.selectedRouteId==='gpu-resident-rack'){
      const rack=eligibleResidentVideoRack(preset,w,h);
      if(!rack)throw new Error('Resident route planner returned an ineligible rack');
      const gpu=await this.ensureGpuBackend(true);
      if(generation!==this.loopGeneration)return;
      const initialState=this.pipeline.tapeSatState(preset,w,h,rack.audio.id);
      const gpuStarted=performance.now();
      const compact=gpu?await gpu.processResident(this.offscreenCanvas,rack.audio.params,initialState):undefined;
      let succeeded=false;
      if(compact&&gpu?.captureMode==='texture'&&gpu.sharedDevice){
        const tail=await this.ensureVideoTail();
        if(generation!==this.loopGeneration)return;
        const context=this.pipeline.residentVideoContext(compact.subarray(0,4096),w,h,started);
        succeeded=!!tail&&await tail.processSource(this.offscreenCanvas,rack.video,context,()=>getInput().data);
        const gpuMs=Math.max(0,performance.now()-gpuStarted-captureReadMs);
        if(generation!==this.loopGeneration)return;
        if(succeeded&&tail&&JSON.stringify(this.activePreset)===JSON.stringify(preset)&&this.currentViewMode==='developed'&&!this.videoRecorder.getIsRecording()&&!this.offlineVideoRecorder.getIsRunning()){
          this.pipeline.tapeSatState(preset,w,h,rack.audio.id,{version:1,sampleRate:44100,bumpLp:compact[8192],toneLp:compact[8193]});
          gpu.showGpu();tail.showGpu();this.perfBadge.dataset.benchmarkBackend='GPU-RESIDENT';
          const audioStarted=performance.now();this.audioEngine.playFrameSamples(compact.subarray(0,4096));const audioMs=performance.now()-audioStarted;
          const telemetryStarted=performance.now();this.hudOverlay?.setTelemetryData({fps:this.currentFps,sampleRate:44100,width:w,height:h,audioSamples:compact.subarray(4096,6144),scopeSamples:compact.subarray(0,4096),rawAudioSamples:compact.subarray(6144,8192),analyser:this.audioEngine.getAnalyser(),seed:this.presetController?.getCurrentSeed()||4821});const telemetryMs=performance.now()-telemetryStarted;
          this.updateFramePerformance(performance.now()-started,'GPU-RESIDENT',{captureMs:Math.max(0,capturedAt-started)+captureReadMs,prepareMs:Math.max(0,gpuStarted-capturedAt),gpuMs,audioMs,telemetryMs});return;
        }
      }
      if(!compact||gpu?.captureMode!=='texture'||!gpu?.sharedDevice)this.gpuUnavailable=true;
      if(!succeeded)this.videoTailUnavailable=true;
      const residentFailure=this.videoTail?.validation?.passed===false?`Resident video-filter fidelity check failed (${this.videoTail.validation.mismatchBytes} RGBA bytes differ); using CPU reference.`:'Resident GPU executor unavailable; using CPU reference.';
      this.residentFailureReason=residentFailure;
      this.currentRoutePlan={...routePlan,selectedRouteId:'cpu-reference',cpuPrefixNodeIds:routePlan.activeNodeIds.slice(),videoSuffixNodeIds:[],fallbackReason:residentFailure};
      this.perfBadge.dataset.benchmarkFallbackReason=residentFailure;
      this.pipeline.tapeSatState(preset,w,h,rack.audio.id,initialState);
      gpu?.showCpu();this.videoTail?.showCpu();
    }
    if(routePlan.selectedRouteId==='cpu-gpu-video-tail'){
      const prefixResult=this.pipeline.processPrefix(getInput().data,w,h,preset,undefined,undefined,routePlan.videoSuffixNodeIds.length);
      const prefix=prefixResult.prefix;
      if(!prefix)throw new Error('GPU video-tail route has no final video suffix');
      const suffix=prefix.remainingVideoNodeIds.map(id=>preset.videoFilters?.find(node=>node.id===id)).filter((node):node is NonNullable<typeof node>=>!!node);
      const tail=await this.ensureVideoTail();
      const gpuStarted=performance.now();
      const succeeded=!!tail&&await tail.process(prefix.rgbaAtBoundary,suffix,prefix.videoContext);
      const gpuMs=performance.now()-gpuStarted;
      if(generation!==this.loopGeneration)return;
      if(succeeded&&tail&&JSON.stringify(this.activePreset)===JSON.stringify(preset)&&this.currentViewMode==='developed'&&!this.videoRecorder.getIsRecording()){
        tail.showGpu();this.perfBadge.dataset.benchmarkBackend='GPU-TAIL';
        const audioStarted=performance.now();this.audioEngine.playFrameSamples(prefix.audioSamples);const audioMs=performance.now()-audioStarted;
        const telemetryStarted=performance.now();this.hudOverlay?.setTelemetryData({fps:this.currentFps,sampleRate:44100,width:w,height:h,audioSamples:prefix.audioSamples,scopeSamples:undefined,rawAudioSamples:prefix.rawAudioSamples,analyser:this.audioEngine.getAnalyser(),seed:this.presetController?.getCurrentSeed()||4821});const telemetryMs=performance.now()-telemetryStarted;
        this.updateFramePerformance(performance.now()-started,'GPU-TAIL',{captureMs:Math.max(0,capturedAt-started)+captureReadMs,prepareMs:Math.max(0,gpuStarted-capturedAt),gpuMs,audioMs,telemetryMs});return;
      }
      if(!succeeded)this.videoTailUnavailable=true;
      tail?.showCpu();this.pipeline.processCpuTail(prefix);
      this.ctx.putImageData(new ImageData(Uint8ClampedArray.from(prefix.rgbaAtBoundary),w,h),0,0);
      this.audioEngine.playFrameSamples(prefix.audioSamples);
      this.hudOverlay?.setTelemetryData({fps:this.currentFps,sampleRate:44100,width:w,height:h,audioSamples:prefix.audioSamples,scopeSamples:undefined,rawAudioSamples:prefix.rawAudioSamples,analyser:this.audioEngine.getAnalyser(),seed:this.presetController?.getCurrentSeed()||4821});
      this.updateFramePerformance(performance.now()-started,'JS');return;
    }
    this.videoTail?.showCpu();
    if(routePlan.selectedRouteId==='gpu-tapesat' && eligible){
      const gpu=await this.ensureGpuBackend();
      if(generation!==this.loopGeneration)return;
      if(gpu){
      const gpuStarted=performance.now();
      const state=this.pipeline.tapeSatState(preset,w,h,eligible.id);
      const compact=await gpu.process(this.offscreenCanvas,getInput,eligible.params,state);
      // In reference-byte mode the lazy pixel read is performed inside
      // gpu.process(). Keep it attributed to capture instead of counting it
      // again as GPU completion/readback time.
      const gpuMs=Math.max(0,performance.now()-gpuStarted-captureReadMs);
      if(generation!==this.loopGeneration)return;
      if(compact){
        this.pipeline.tapeSatState(preset,w,h,eligible.id,{version:1,sampleRate:44100,bumpLp:compact[8192],toneLp:compact[8193]});
        if(JSON.stringify(this.activePreset)!==JSON.stringify(preset) || this.currentViewMode!=='developed' || this.videoRecorder.getIsRecording()){gpu.showCpu();return;}
        gpu.showGpu();
        this.perfBadge.dataset.benchmarkBackend='GPU';
        const audioStarted=performance.now();
        this.audioEngine.playFrameSamples(compact.subarray(0,4096));
        const audioMs=performance.now()-audioStarted;
        const telemetryStarted=performance.now();
        this.hudOverlay?.setTelemetryData({fps:this.currentFps,sampleRate:44100,width:w,height:h,audioSamples:compact.subarray(4096,6144),scopeSamples:compact.subarray(0,4096),rawAudioSamples:compact.subarray(6144,8192),analyser:this.audioEngine.getAnalyser(),seed:this.presetController?.getCurrentSeed()||4821});
        const telemetryMs=performance.now()-telemetryStarted;
        this.updateFramePerformance(performance.now()-started,'GPU',{captureMs:Math.max(0,capturedAt-started)+captureReadMs,prepareMs:Math.max(0,gpuStarted-capturedAt),gpuMs,audioMs,telemetryMs});return;
      }
      }
    }
    this.gpu?.showCpu();
    if(this.benchmarkEnabled)this.perfBadge.dataset.benchmarkBackend=this.wasmEnabled?'WASM':'JS';

    if (!this.cachedImageData || this.cachedImageData.width !== w || this.cachedImageData.height !== h) {
      this.cachedImageData = this.ctx.createImageData(w, h);
    }

    const res = this.pipeline.processFrame(
      getInput().data,
      w,
      h,
      this.activePreset,
      this.cachedImageData.data
    );

    if (this.currentViewMode === 'exposure') {
      const d = this.cachedImageData.data;
      const s = getInput().data;
      for (let i = 0; i < d.length; i += 4) {
        const diffR = Math.abs(d[i] - s[i]);
        const diffG = Math.abs(d[i + 1] - s[i + 1]);
        const diffB = Math.abs(d[i + 2] - s[i + 2]);
        const luma = Math.min(255, (diffR + diffG + diffB) * 1.5);
        d[i] = luma > 128 ? 200 : 20;
        d[i + 1] = luma > 64 ? 214 : 30;
        d[i + 2] = luma > 180 ? 101 : 15;
      }
    }

    this.ctx.putImageData(this.cachedImageData, 0, 0);

    if (this.videoRecorder.getIsRecording()) {
      this.videoRecorder.captureFrame();
    }

    this.audioEngine.playFrameSamples(res.audioSamples);

    if (this.hudOverlay) {
      this.hudOverlay.setTelemetryData({
        fps: this.currentFps,
        sampleRate: this.presetController?.getCurrentBusRate() || 44100,
        width: w,
        height: h,
        audioSamples: res.audioSamples,
        scopeSamples: undefined,
        rawAudioSamples: res.rawAudioSamples,
        analyser: this.audioEngine.getAnalyser(),
        seed: this.presetController?.getCurrentSeed() || 4821,
      });
    }

    if (this.currentViewMode === 'scope' && this.scopeCtx) {
      this.renderOscilloscope();
    }

    this.updateFramePerformance(this.benchmarkEnabled ? performance.now()-started : res.executionTimeMs,this.wasmEnabled?'WASM':'JS');
  }

  private updateFramePerformance(elapsed:number,backend:'JS'|'WASM'|'GPU'|'GPU-TAIL'|'GPU-RESIDENT',stages={captureMs:0,prepareMs:0,gpuMs:0,audioMs:0,telemetryMs:0}):void {
    const routeId=backend==='GPU'?'gpu-tapesat':backend==='GPU-TAIL'?'cpu-gpu-video-tail':backend==='GPU-RESIDENT'?'gpu-resident-rack':backend==='WASM'?'wasm-cpu':'cpu-reference';
    if(routeId!==this.selectedRouteId){
      this.selectedRouteId=routeId;
      this.routeChanges.push({atSeconds:this.sessionStart?(performance.now()-this.sessionStart)/1000:0,routeId});
    }
    this.perfBadge.dataset.benchmarkRoute=routeId;
    if(this.benchmarkEnabled){
      const key=JSON.stringify([this.mediaController.getSourceInfo(),this.activePreset,this.currentViewMode,this.canvas.width,this.canvas.height,this.audioEngine.getMuted(),this.hudOverlay.isEnabled(),this.videoRecorder.getIsRecording()]);
      const now=performance.now();
      if(!this.sessionStart){this.sessionStart=now;this.hudOverlay.resetRenderTimings();}
      if(key!==this.measureKey || !this.measureStart){
        if(this.measureStart)this.closeMeasuredWindow();
        const reason=!this.measureKey?'initial-settings':!this.measureStart?'frame-loop-restarted':'settings-changed';
        this.measureKey=key;this.measureStart=now+10000;this.resetHistory.push({atSeconds:(now-this.sessionStart)/1000,reason});
      }
      if(now>=this.measureStart){this.frameMeasurements.push(elapsed);this.stageMeasurements.push({...stages,otherMs:Math.max(0,elapsed-stages.captureMs-stages.prepareMs-stages.gpuMs-stages.audioMs-stages.telemetryMs)});if(backend==='GPU')this.measuredGpuFrames++;else if(backend==='GPU-TAIL')this.measuredVideoTailFrames++;else if(backend==='GPU-RESIDENT')this.measuredResidentFrames++;else if(backend==='WASM')this.measuredWasmFrames++;else this.measuredJsFrames++;}
    }
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      this.frameCount = 0;
      this.lastTime = now;
      if (this.perfBadge) {
        const sessionSeconds=this.sessionStart?(now-this.sessionStart)/1000:0;
        const measuredSeconds=(this.measuredWindowMs+Math.max(0,now-Math.max(this.measureStart,this.sessionStart||now)))/1000;
        this.perfBadge.textContent = `${this.currentFps} FPS | ${elapsed.toFixed(1)} ms${this.benchmarkEnabled ? ` | ${backend} | ${sessionSeconds.toFixed(0)}s session / ${measuredSeconds.toFixed(0)}s measured` : ''}`;
      }
    }
  }

  private closeMeasuredWindow():void {
    if(this.measureStart && this.sessionStart){const now=performance.now();this.measuredWindowMs+=Math.max(0,now-Math.max(this.measureStart,this.sessionStart));}
  }

  private downloadApplicationReport():void {
    const now=performance.now();
    const seconds=(this.measuredWindowMs+Math.max(0,this.measureStart?now-Math.max(this.measureStart,this.sessionStart||now):0))/1000;
    const declaredSourceFps=Number(this.gpuQuery.get('gpu-source-fps'));
    const frameBytes=this.canvas.width*this.canvas.height*4;
    const arenaBytes=this.canvas.width*this.canvas.height*3*4;
    const gpuCaptureMode=(this.gpu?.validation as {captureMode?:string}|undefined)?.captureMode??null;
    const textureFrames=gpuCaptureMode==='texture'?this.measuredGpuFrames:0;
    const byteCaptureGpuFrames=this.measuredGpuFrames-textureFrames;
    const cpuRasterReadbackBytes=(this.measuredJsFrames+this.measuredWasmFrames+this.measuredVideoTailFrames+byteCaptureGpuFrames)*frameBytes;
    const transferLedger={
      accounting:'API-observed logical payloads plus explicitly labeled source-pixel lower bounds; not physical bus traffic',
      measuredFrames:this.frameMeasurements.length,
      perFrameBytes:{
        cpuImageDataReadback:this.measuredJsFrames+this.measuredWasmFrames+this.measuredVideoTailFrames?frameBytes:0,
        gpuVideoTailRgbaUpload:this.measuredVideoTailFrames?frameBytes:0,
        gpuReferenceByteCaptureReadback:byteCaptureGpuFrames?frameBytes:0,
        gpuReferenceByteUpload:byteCaptureGpuFrames?frameBytes:0,
        gpuExternalTextureInputLowerBound:textureFrames?frameBytes:0,
        gpuResidentExternalImageImportLowerBound:this.measuredResidentFrames?frameBytes*2:0,
        gpuCompactMappedMonitor:this.measuredGpuFrames?8194*4:0,
        wasmResidentSampleArena:this.measuredWasmFrames?arenaBytes:0,
        explicitWasmSegmentCopies:0,
        mainWorkerTransfers:0,
      },
      measuredTotals:{
        cpuImageDataReadbackBytes:(this.measuredJsFrames+this.measuredWasmFrames+this.measuredVideoTailFrames)*frameBytes,
        gpuReferenceByteCaptureReadbackBytes:byteCaptureGpuFrames*frameBytes,
        gpuReferenceByteUploadBytes:byteCaptureGpuFrames*frameBytes,
        gpuVideoTailRgbaUploadBytes:this.measuredVideoTailFrames*frameBytes,
        gpuExternalTextureInputLowerBoundBytes:textureFrames*frameBytes,
        gpuResidentExternalImageImportLowerBoundBytes:this.measuredResidentFrames*frameBytes*2,
        gpuCompactMappedMonitorBytes:(this.measuredGpuFrames+this.measuredResidentFrames)*8194*4,
        wasmResidentSampleArenaBytes:this.measuredWasmFrames*arenaBytes,
        explicitWasmSegmentCopyBytes:0,
        mainWorkerTransferBytes:0,
        totalCpuRasterReadbackBytes:cpuRasterReadbackBytes,
      },
      synchronizations:{gpuQueueSubmissions:this.measuredGpuFrames+this.measuredVideoTailFrames+this.measuredResidentFrames*2,gpuMonitorMapOperations:this.measuredGpuFrames+this.measuredResidentFrames,gpuValidationScopes:this.gpuPerFrameValidation?this.measuredGpuFrames+this.measuredResidentFrames:0},
      unmeasured:'GPU external-image import copies, browser/driver staging, physical bus traffic, GPU-local shader memory traffic, and compositor/display transfer',
    };
    const report={
      schemaVersion:1,runId:crypto.randomUUID(),createdAt:new Date().toISOString(),build:BUILD_INFO,
      route:{requested:this.gpuQuery.get('gpu')??'auto',selectedRouteId:this.selectedRouteId,
        activeNodeIds:this.currentRoutePlan?.activeNodeIds??[],cpuPrefixNodeIds:this.currentRoutePlan?.cpuPrefixNodeIds??[],videoSuffixNodeIds:this.currentRoutePlan?.videoSuffixNodeIds??[],
        fallbackReason:this.currentRoutePlan?.fallbackReason??null,changes:this.routeChanges.slice()},
      source:this.mediaController.getSourceInfo(),backend:this.selectedRouteId==='gpu-tapesat'?'experimental-app-tapesat':this.selectedRouteId==='gpu-resident-rack'?'experimental-app-resident-rack':this.selectedRouteId==='cpu-gpu-video-tail'?'experimental-app-gpu-video-tail':this.wasmEnabled?'wasm-scalar-arena':'javascript-reference',
      scope:'720p source capture, application processing, output presentation submission, live audio submission and HUD telemetry; HUD RAF competes for throughput; excludes physical display confirmation',
      preset:this.activePreset,width:this.canvas.width,height:this.canvas.height,warmupSeconds:10,
      sessionSeconds:this.sessionStart?Math.max(0,(now-this.sessionStart)/1000):0,
      measuredSeconds:seconds,measuredFrames:this.frameMeasurements.length,processedFps:seconds ? this.frameMeasurements.length/seconds : 0,
      gpuFrames:this.measuredGpuFrames,gpuVideoTailFrames:this.measuredVideoTailFrames,gpuResidentFrames:this.measuredResidentFrames,wasmFrames:this.measuredWasmFrames,jsFrames:this.measuredJsFrames,missedPresentedCallbacks:this.missedCallbacks,
      transferLedger,
      measurementResets:this.resetHistory,
      timings:{framePathMs:summarize(this.frameMeasurements),captureMs:summarize(this.stageMeasurements.map(s=>s.captureMs)),preparationMs:summarize(this.stageMeasurements.map(s=>s.prepareMs)),gpuCompletionAndReadbackMs:summarize(this.stageMeasurements.map(s=>s.gpuMs)),audioSubmissionMs:summarize(this.stageMeasurements.map(s=>s.audioMs)),telemetryUpdateMs:summarize(this.stageMeasurements.map(s=>s.telemetryMs)),otherFrameWorkMs:summarize(this.stageMeasurements.map(s=>s.otherMs)),hudRenderMs:this.hudOverlay.getRenderTimingSummary()},audioMuted:this.audioEngine.getMuted(),audioVolume:this.audioEngine.getVolume(),
      hudEnabled:this.hudOverlay.isEnabled(),gpuPerFrameValidation:this.gpuPerFrameValidation,gpuFusedApplyFinish:this.gpuFusedApplyFinish,audioContextState:this.audioEngine.getAnalyser()?.context.state??null,
      sourcePaused:this.mediaController.getLoadedVideo()?.paused??null,gpuValidation:this.gpu?.validation??null,
      gpuVideoTailValidation:this.videoTail?.validation??null,
      benchmarkConditions:{backendRequested:this.gpuQuery.get('gpu')??'default',profileRequested:this.gpuProfileEnabled,audioRequested:this.gpuQuery.get('gpu-audio')??'unspecified',hudRequested:this.gpuQuery.get('gpu-hud')??'default',captureModeRequested:this.gpuCaptureMode,declaredSourceFps:Number.isFinite(declaredSourceFps)&&declaredSourceFps>0?declaredSourceFps:null,deviceLabel:this.gpuQuery.get('gpu-device-label')?.trim()||null},
      wasmBuild:this.wasmRuntime?.buildInfo??null,
      ...(this.gpuProfileEnabled?{gpuInternalTimings:this.gpu?.getInternalTimingSummary()??null}:{}),
      environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency},
      acceptance:'application-path measurements recorded; physical presentation/audio, decode-drop attribution, other presets and phone gates remain separate',
    };
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`app-benchmark-${report.runId}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  private renderOscilloscope(): void {
    const analyser = this.audioEngine.getAnalyser();
    if (!analyser || !this.scopeCtx) return;

    if (this.scopeCanvas.width !== this.canvas.width || this.scopeCanvas.height !== this.canvas.height) {
      this.scopeCanvas.width = this.canvas.width;
      this.scopeCanvas.height = this.canvas.height;
    }

    const sw = this.scopeCanvas.width;
    const sh = this.scopeCanvas.height;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    this.scopeCtx.clearRect(0, 0, sw, sh);
    this.scopeCtx.lineWidth = 1.8;
    this.scopeCtx.strokeStyle = '#c8d665';
    this.scopeCtx.shadowBlur = 8;
    this.scopeCtx.shadowColor = '#c8d665';
    this.scopeCtx.beginPath();

    const sliceWidth = sw / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * sh) / 2;

      if (i === 0) {
        this.scopeCtx.moveTo(x, y);
      } else {
        this.scopeCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    this.scopeCtx.stroke();
    this.scopeCtx.shadowBlur = 0;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new SonificationApp();
});
