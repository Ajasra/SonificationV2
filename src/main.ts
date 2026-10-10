// Main application entry point for Sonification V2
// Modular architecture: Photographic Studio aesthetic, Audio Rack / PCB hardware details, and Tactile Rotary Knobs
import type { ColorSpace, CompandingLaw, FilterId, RawType, SonificationPreset } from './types/index.ts';
import { SonificationPipeline } from './engine/pipeline.ts';
import { PresetManager } from './presets/preset-manager.ts';
import { FILTER_DESCRIPTORS } from './engine/filters/factory.ts';
import { SoundCameraAudio } from './audio/sound-camera.ts';
import { CameraManager } from './camera/camera-manager.ts';
import { VideoRecorder } from './record/video-recorder.ts';
import { OfflineVideoRecorder } from './record/offline-video-recorder.ts';
import { RotaryKnob } from './components/rotary-knob.ts';
import { AccountManager, type StoredPreset } from './account/account-manager.ts';
import { validatePreset } from './presets/validate-preset.ts';
import { HudOverlay } from './components/hud-overlay.ts';

// Extracted UI Controllers
import { QrModalController } from './ui/qr-modal.ts';
import { FilterLibraryModalController } from './ui/filter-library-modal.ts';
import { AccountModalController } from './ui/account-modal.ts';
import { RackController } from './ui/rack-controller.ts';
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
  private offscreenCanvas = document.createElement('canvas');
  private offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true })!;
  private scopeCanvas = document.getElementById('scope-canvas') as HTMLCanvasElement;
  private scopeCtx = this.scopeCanvas?.getContext('2d');
  private hudCanvas = document.getElementById('hud-canvas') as HTMLCanvasElement;
  private hudOverlay!: HudOverlay;
  private btnToggleHud = document.getElementById('btn-toggle-hud') as HTMLButtonElement | null;
  private btnMobileHud = document.getElementById('btn-mobile-hud') as HTMLButtonElement | null;
  private btnDrawerHud = document.getElementById('btn-drawer-hud') as HTMLButtonElement | null;
  private perfBadge = document.getElementById('perf-badge') as HTMLDivElement;

  private selectColorSpace = document.getElementById('select-colorspace') as HTMLSelectElement;
  private selectRawType = document.getElementById('select-rawtype') as HTMLSelectElement;
  private selectBitDepth = document.getElementById('select-bitdepth') as HTMLSelectElement;
  private selectLaw = document.getElementById('select-law') as HTMLSelectElement;
  private checkEqualize = document.getElementById('check-equalize') as HTMLInputElement;
  private selectResolution = document.getElementById('select-resolution') as HTMLSelectElement;
  private inputPresetDesc = document.getElementById('input-preset-desc') as HTMLTextAreaElement;

  private statusResolution = document.getElementById('status-resolution');

  private customMobileHost = '';
  private pendingAccountSave = false;
  private pendingAccountPublish = false;

  // Master Volume Rotary Knob
  private masterGainKnob!: RotaryKnob;

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

  // Sub-controllers
  private qrModalController!: QrModalController;
  public filterLibraryModalController!: FilterLibraryModalController;
  private accountModalController!: AccountModalController;
  private rackController!: RackController;
  private mobileController!: MobileController;
  private mediaController!: MediaController;
  private presetController!: PresetController;

  private stopFrameLoop(): void {
    this.loopGeneration++;
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    if (this.videoFrameId !== null) this.frameVideo?.cancelVideoFrameCallback(this.videoFrameId);
    this.animFrameId = null;
    this.videoFrameId = null;
    this.frameVideo = null;
  }

  private scheduleFrame(video: HTMLVideoElement, callback: () => void): void {
    this.frameVideo = video;
    if (typeof video.requestVideoFrameCallback === 'function') {
      this.videoFrameId = video.requestVideoFrameCallback(callback);
    } else {
      this.animFrameId = requestAnimationFrame(callback);
    }
  }

  private async flipCamera(): Promise<void> {
    if (this.cameraBusy || !this.cameraManager.isActive()) return;
    this.cameraBusy = true;
    this.stopFrameLoop();
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
    this.bindEvents();
    void this.resolveSharedPresetHash();

    const releaseCamera = () => {
      this.stopFrameLoop();
      this.cameraManager.stop();
      this.updateCamToggleUI(false);
      const button = document.getElementById('btn-toggle-camera');
      if (button) button.textContent = 'Live camera';
    };
    window.addEventListener('pagehide', releaseCamera);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseCamera();
      else if (this.mediaController?.getLoadedVideo()) this.mediaController.startVideoFileLoop();
    });
  }

  private initControllers(): void {
    this.rackController = new RackController({
      getActivePreset: () => this.activePreset,
      onRequestRender: () => this.requestRender(),
    });

    this.filterLibraryModalController = new FilterLibraryModalController({
      onAddFilter: (type) => this.rackController.addFilter(type),
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
      },
      onOpenAccountModal: (mode) => this.accountModalController.open(mode),
      onShowQrForHash: (hash) => this.qrModalController.showQrForHash(hash),
      onShowNotice: (msg, err) => this.showPresetNotice(msg, err),
      onRequestRender: () => this.requestRender(),
      onBusRateChanged: (rate) => {
        this.audioEngine.setSampleRate(rate);
      },
    });

    this.mediaController = new MediaController({
      canvas: this.canvas,
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
      onFrameProcessed: (data) => {
        this.inputImageBuffer = data;
        this.processAndBlit();
      },
      onCameraStopped: () => {
        const btnCam = document.getElementById('btn-toggle-camera');
        if (btnCam) {
          btnCam.textContent = 'Live camera';
          btnCam.classList.remove('btn-hw-primary');
        }
        document.getElementById('btn-flip-camera')?.classList.add('hidden');
      },
      scheduleFrame: (v, cb) => this.scheduleFrame(v, cb),
      stopFrameLoop: () => this.stopFrameLoop(),
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
        if (this.selectResolution) this.selectResolution.value = res;
        this.requestRender();
      },
      onVolumeChange: (vol) => {
        if (this.masterGainKnob) this.masterGainKnob.setValue(vol);
      },
    });
  }

  private initHudOverlay(): void {
    const wrap = document.querySelector('.hud-bay-canvas-wrap') as HTMLElement;
    if (this.hudCanvas && wrap) {
      this.hudOverlay = new HudOverlay(wrap, this.hudCanvas);
      this.updateHudToggleUI();

      this.btnToggleHud?.addEventListener('click', () => {
        this.hudOverlay.toggle();
        this.updateHudToggleUI();
        this.requestRender();
      });

      this.btnMobileHud?.addEventListener('click', () => {
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

    if (this.btnMobileHud) {
      this.btnMobileHud.classList.toggle('active', isEnabled);
      const text = document.getElementById('mobile-hud-badge-text');
      if (text) text.textContent = isEnabled ? 'HUD ON' : 'HUD OFF';
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
    const slot = document.getElementById('master-knob-slot');
    if (!slot) return;
    this.masterGainKnob = new RotaryKnob({
      min: 0,
      max: 1.0,
      step: 0.01,
      value: 0.8,
      defaultValue: 0.8,
      label: 'OUTPUT GAIN',
      tooltip: 'Master Audio Volume Level [Range: 0.0 to 1.0]',
      size: 38,
      onChange: (val) => {
        this.audioEngine.setVolume(val);
        const mobileVol = document.getElementById('mobile-slider-volume') as HTMLInputElement | null;
        if (mobileVol) {
          mobileVol.value = String(val);
        }
      },
    });
    slot.appendChild(this.masterGainKnob.element);
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
        const busBtn = document.getElementById('btn-bus-step');
        busBtn?.click();
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

    if (this.selectResolution) {
      this.selectResolution.onchange = () => {
        const res = this.selectResolution.value as '360p' | '480p' | '720p' | 'native';
        this.mediaController.setResolution(res);
        this.requestRender();
      };
    }

    // Modal triggers
    document.getElementById('btn-about')?.addEventListener('click', () => {
      document.getElementById('about-modal')?.classList.remove('hidden');
    });
    document.getElementById('btn-close-about')?.addEventListener('click', () => {
      document.getElementById('about-modal')?.classList.add('hidden');
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
      const allTypes = Object.keys(FILTER_DESCRIPTORS) as FilterId[];
      const count = Math.floor(1 + Math.random() * 3);
      this.activePreset.filters = [];

      for (let i = 0; i < count; i++) {
        const t = allTypes[Math.floor(Math.random() * allTypes.length)];
        const desc = FILTER_DESCRIPTORS[t];
        const params: Record<string, number> = {};
        for (const p of desc.params) {
          params[p.name] = p.min + Math.random() * (p.max - p.min);
        }
        this.activePreset.filters.push({
          id: 'f_' + Math.random().toString(36).substring(2, 7),
          type: t,
          enabled: true,
          sampleRate: 44100,
          params,
        });
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

  private async startLiveCameraFeed(): Promise<boolean> {
    if (this.cameraBusy || document.hidden) return false;
    this.cameraBusy = true;
    try {
      this.mediaController?.stopVideoFile();
      await this.cameraManager.start(640, 480);
      if (!this.cameraManager.isActive() || document.hidden) return false;
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
      this.stopFrameLoop();
      this.cameraManager.stop();
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
    this.stopFrameLoop();
    const generation = this.loopGeneration;

    const onFrame = () => {
      if (generation !== this.loopGeneration || !this.cameraManager.isActive()) return;

      const video = this.cameraManager.getVideoElement();
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

        this.offscreenCtx.drawImage(video, 0, 0, dims.w, dims.h);
        this.inputImageBuffer = this.offscreenCtx.getImageData(0, 0, dims.w, dims.h);
        this.processAndBlit();
      }

      this.scheduleFrame(video, onFrame);
    };

    const video = this.cameraManager.getVideoElement();
    this.scheduleFrame(video, onFrame);
  }

  private requestRender(): void {
    if (!this.cameraManager.isActive() && !this.mediaController?.getLoadedVideo()) {
      requestAnimationFrame(() => this.processAndBlit());
    }
  }

  private processAndBlit(): void {
    if (!this.inputImageBuffer) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    if (this.statusResolution) {
      this.statusResolution.textContent = `MODEL RESOLUTION ${w} × ${h}`;
    }

    if (this.currentViewMode === 'source') {
      this.ctx.putImageData(this.inputImageBuffer, 0, 0);
      return;
    }

    if (!this.cachedImageData || this.cachedImageData.width !== w || this.cachedImageData.height !== h) {
      this.cachedImageData = this.ctx.createImageData(w, h);
    }

    const res = this.pipeline.processFrame(
      this.inputImageBuffer.data,
      w,
      h,
      this.activePreset,
      this.cachedImageData.data
    );

    if (this.currentViewMode === 'exposure') {
      const d = this.cachedImageData.data;
      const s = this.inputImageBuffer.data;
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
        rawAudioSamples: res.rawAudioSamples,
        analyser: this.audioEngine.getAnalyser(),
        seed: this.presetController?.getCurrentSeed() || 4821,
      });
    }

    if (this.currentViewMode === 'scope' && this.scopeCtx) {
      this.renderOscilloscope();
    }

    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      this.frameCount = 0;
      this.lastTime = now;
      if (this.perfBadge) {
        this.perfBadge.textContent = `${this.currentFps} FPS | ${res.executionTimeMs.toFixed(1)} ms`;
      }
    }
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
