// Main application entry point for Sonification V2
import type { ColorSpace, CompandingLaw, FilterId, RawType, SonificationPreset } from './types/index.ts';
import { SonificationPipeline } from './engine/pipeline.ts';
import { PresetManager } from './presets/preset-manager.ts';
import { FILTER_DESCRIPTORS } from './engine/filters/factory.ts';
import { SoundCameraAudio } from './audio/sound-camera.ts';
import { CameraManager } from './camera/camera-manager.ts';
import { VideoRecorder } from './record/video-recorder.ts';

class SonificationApp {
  private pipeline = new SonificationPipeline();
  private presetManager = new PresetManager();
  private audioEngine = new SoundCameraAudio();
  private cameraManager = new CameraManager();
  private videoRecorder = new VideoRecorder();

  private activePreset!: SonificationPreset;

  // DOM Elements
  private canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private perfBadge = document.getElementById('perf-badge') as HTMLDivElement;

  private selectPreset = document.getElementById('select-preset') as HTMLSelectElement;
  private selectColorSpace = document.getElementById('select-colorspace') as HTMLSelectElement;
  private selectRawType = document.getElementById('select-rawtype') as HTMLSelectElement;
  private selectBitDepth = document.getElementById('select-bitdepth') as HTMLSelectElement;
  private selectLaw = document.getElementById('select-law') as HTMLSelectElement;
  private checkEqualize = document.getElementById('check-equalize') as HTMLInputElement;

  private filterRackContainer = document.getElementById('filter-rack-container') as HTMLDivElement;

  private qrModal = document.getElementById('qr-modal') as HTMLDivElement;
  private qrImage = document.getElementById('qr-image') as HTMLImageElement;
  private addFilterModal = document.getElementById('add-filter-modal') as HTMLDivElement;
  private filterLibraryList = document.getElementById('filter-library-list') as HTMLDivElement;

  private inputImageBuffer: ImageData | null = null;
  private animFrameId: number | null = null;

  private lastTime = performance.now();
  private frameCount = 0;
  private currentFps = 0;

  constructor() {
    this.initPreset();
    this.initCanvasPlaceholder();
    this.bindEvents();
    this.renderFilterRack();
    this.renderFilterLibrary();
    this.renderPresetDropdown();
  }

  private initPreset(): void {
    // Check if URL hash has a preset
    const hashPreset = this.presetManager.decodePresetFromHash(window.location.hash);
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
    const grad = this.ctx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, '#001a2c');
    grad.addColorStop(0.5, '#00f0ff');
    grad.addColorStop(1, '#ff007f');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, 640, 480);
    this.inputImageBuffer = this.ctx.getImageData(0, 0, 640, 480);
    this.requestRender();
  }

  private syncFormWithPreset(): void {
    this.selectColorSpace.value = this.activePreset.reader.colorSpace;
    this.selectRawType.value = this.activePreset.reader.rawType;
    this.selectBitDepth.value = String(this.activePreset.reader.bits);
    this.selectLaw.value = this.activePreset.reader.law;
    this.checkEqualize.checked = this.activePreset.equalize;
  }

  private renderPresetDropdown(): void {
    this.selectPreset.innerHTML = '';
    const presets = this.presetManager.getAllPresets();
    for (const p of presets) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = p.id === this.activePreset.id;
      this.selectPreset.appendChild(opt);
    }
  }

  private renderFilterRack(): void {
    this.filterRackContainer.innerHTML = '';

    this.activePreset.filters.forEach((filterConfig, idx) => {
      const desc = FILTER_DESCRIPTORS[filterConfig.type];
      const card = document.createElement('div');
      card.className = 'rack-module';

      const header = document.createElement('div');
      header.className = 'module-header';

      const title = document.createElement('span');
      title.className = 'module-title';
      title.textContent = `${idx + 1}. ${desc ? desc.name : filterConfig.type}`;

      const headerBtns = document.createElement('div');
      headerBtns.style.display = 'flex';
      headerBtns.style.gap = '6px';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = `btn btn-sm ${filterConfig.enabled ? 'btn-primary' : 'btn-outline'}`;
      toggleBtn.textContent = filterConfig.enabled ? 'ON' : 'BYP';
      toggleBtn.onclick = () => {
        filterConfig.enabled = !filterConfig.enabled;
        this.renderFilterRack();
        this.requestRender();
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-sm btn-outline';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => {
        this.activePreset.filters.splice(idx, 1);
        this.renderFilterRack();
        this.requestRender();
      };

      headerBtns.appendChild(toggleBtn);
      headerBtns.appendChild(removeBtn);
      header.appendChild(title);
      header.appendChild(headerBtns);
      card.appendChild(header);

      if (desc && desc.params.length > 0) {
        const paramsGrid = document.createElement('div');
        paramsGrid.className = 'module-params';

        for (const p of desc.params) {
          const val = filterConfig.params[p.name] !== undefined ? filterConfig.params[p.name] : p.value;

          const ctrl = document.createElement('label');
          ctrl.className = 'param-control';
          ctrl.innerHTML = `<span>${p.label}: <b>${val.toFixed(2)}</b></span>`;

          const slider = document.createElement('input');
          slider.type = 'range';
          slider.className = 'param-slider';
          slider.min = String(p.min);
          slider.max = String(p.max);
          slider.step = String(p.step);
          slider.value = String(val);

          slider.oninput = () => {
            const newVal = parseFloat(slider.value);
            filterConfig.params[p.name] = newVal;
            ctrl.querySelector('b')!.textContent = newVal.toFixed(2);
            this.requestRender();
          };

          ctrl.appendChild(slider);
          paramsGrid.appendChild(ctrl);
        }

        card.appendChild(paramsGrid);
      }

      this.filterRackContainer.appendChild(card);
    });
  }

  private renderFilterLibrary(): void {
    this.filterLibraryList.innerHTML = '';
    const keys = Object.keys(FILTER_DESCRIPTORS) as FilterId[];

    for (const key of keys) {
      const desc = FILTER_DESCRIPTORS[key];
      const item = document.createElement('div');
      item.className = 'library-item';
      item.innerHTML = `
        <div>
          <b>${desc.name}</b>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${desc.description}</div>
        </div>
        <button class="btn btn-sm btn-outline">+ Add</button>
      `;
      item.onclick = () => {
        const defaultParams: Record<string, number> = {};
        for (const p of desc.params) {
          defaultParams[p.name] = p.value;
        }

        this.activePreset.filters.push({
          id: 'f_' + Math.random().toString(36).substring(2, 7),
          type: key,
          enabled: true,
          sampleRate: desc.defaultSampleRate,
          params: defaultParams,
        });

        this.addFilterModal.classList.add('hidden');
        this.renderFilterRack();
        this.requestRender();
      };
      this.filterLibraryList.appendChild(item);
    }
  }

  private bindEvents(): void {
    // Preset dropdown
    this.selectPreset.onchange = () => {
      const found = this.presetManager.getPresetById(this.selectPreset.value);
      if (found) {
        this.activePreset = JSON.parse(JSON.stringify(found));
        this.syncFormWithPreset();
        this.renderFilterRack();
        this.requestRender();
      }
    };

    // Save custom preset
    document.getElementById('btn-save-custom-preset')!.onclick = () => {
      const name = prompt('Preset Name:', 'Custom Glitch');
      if (name) {
        this.activePreset.id = 'usr_' + Date.now();
        this.activePreset.name = name;
        this.presetManager.savePreset(this.activePreset);
        this.renderPresetDropdown();
      }
    };

    // Stream inputs
    this.selectColorSpace.onchange = () => {
      this.activePreset.reader.colorSpace = this.selectColorSpace.value as ColorSpace;
      this.activePreset.writer.colorSpace = this.selectColorSpace.value as ColorSpace;
      this.requestRender();
    };

    this.selectRawType.onchange = () => {
      this.activePreset.reader.rawType = this.selectRawType.value as RawType;
      this.activePreset.writer.rawType = this.selectRawType.value as RawType;
      this.requestRender();
    };

    this.selectBitDepth.onchange = () => {
      const bits = parseInt(this.selectBitDepth.value, 10) as 8 | 16 | 24;
      this.activePreset.reader.bits = bits;
      this.activePreset.writer.bits = bits;
      this.requestRender();
    };

    this.selectLaw.onchange = () => {
      this.activePreset.reader.law = this.selectLaw.value as CompandingLaw;
      this.activePreset.writer.law = this.selectLaw.value as CompandingLaw;
      this.requestRender();
    };

    this.checkEqualize.onchange = () => {
      this.activePreset.equalize = this.checkEqualize.checked;
      this.requestRender();
    };

    // Add filter modal
    document.getElementById('btn-add-filter')!.onclick = () => {
      this.addFilterModal.classList.remove('hidden');
    };
    document.getElementById('btn-close-filter-modal')!.onclick = () => {
      this.addFilterModal.classList.add('hidden');
    };

    // QR Code modal
    document.getElementById('btn-qr-modal')!.onclick = async () => {
      const dataUrl = await this.presetManager.generatePresetQrCode(this.activePreset);
      this.qrImage.src = dataUrl;
      this.qrModal.classList.remove('hidden');
    };
    document.getElementById('btn-close-qr')!.onclick = () => {
      this.qrModal.classList.add('hidden');
    };
    document.getElementById('btn-copy-link')!.onclick = () => {
      const hash = this.presetManager.encodePresetToHash(this.activePreset);
      navigator.clipboard.writeText(window.location.origin + window.location.pathname + hash);
      alert('Preset link copied to clipboard!');
    };

    // Randomizers
    document.getElementById('btn-random-params')!.onclick = () => {
      for (const f of this.activePreset.filters) {
        const desc = FILTER_DESCRIPTORS[f.type];
        if (desc) {
          for (const p of desc.params) {
            f.params[p.name] = p.min + Math.random() * (p.max - p.min);
          }
        }
      }
      this.renderFilterRack();
      this.requestRender();
    };

    document.getElementById('btn-random-stream')!.onclick = () => {
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
    };

    document.getElementById('btn-random-filters')!.onclick = () => {
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

      this.renderFilterRack();
      this.requestRender();
    };

    // File input (Image)
    const fileInput = document.getElementById('input-file') as HTMLInputElement;
    fileInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadImageFromFile(file);
    };

    // File input (Video)
    const videoFileInput = document.getElementById('input-video-file') as HTMLInputElement;
    videoFileInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadVideoFromFile(file);
    };

    // Drag and drop image or video
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        if (file.type.startsWith('video/')) {
          this.loadVideoFromFile(file);
        } else if (file.type.startsWith('image/')) {
          this.loadImageFromFile(file);
        }
      }
    });

    // Camera toggle
    const btnCamera = document.getElementById('btn-toggle-camera') as HTMLButtonElement;
    const btnFlipCamera = document.getElementById('btn-flip-camera') as HTMLButtonElement;

    btnCamera.onclick = async () => {
      this.stopVideoFile();
      if (this.cameraManager.isActive()) {
        this.cameraManager.stop();
        btnCamera.textContent = '📹 Live Camera';
        btnCamera.classList.remove('btn-primary');
        btnFlipCamera.classList.add('hidden');
      } else {
        try {
          await this.cameraManager.start(640, 480);
          btnCamera.textContent = '⏹ Stop Camera';
          btnCamera.classList.add('btn-primary');
          btnFlipCamera.classList.remove('hidden');
          this.startLiveLoop();
        } catch (_) {
          alert('Could not access camera.');
        }
      }
    };

    btnFlipCamera.onclick = async () => {
      await this.cameraManager.toggleFacingMode();
    };

    // Audio controls
    const btnAudio = document.getElementById('btn-toggle-audio') as HTMLButtonElement;
    const sliderVol = document.getElementById('slider-volume') as HTMLInputElement;

    btnAudio.onclick = () => {
      this.audioEngine.init();
      const isMuted = !this.audioEngine.getMuted();
      this.audioEngine.setMuted(isMuted);
      btnAudio.textContent = isMuted ? '🔇 Sound: Muted' : '🔊 Sound: Active';
      btnAudio.classList.toggle('active', !isMuted);
    };

    sliderVol.oninput = () => {
      this.audioEngine.setVolume(parseFloat(sliderVol.value));
    };

    // Photo Snapshot
    document.getElementById('btn-shutter')!.onclick = () => {
      const link = document.createElement('a');
      link.download = `sonification_${Date.now()}.png`;
      link.href = this.canvas.toDataURL('image/png');
      link.click();
    };

    document.getElementById('btn-save-image')!.onclick = () => {
      document.getElementById('btn-shutter')!.click();
    };

    // Video Recording
    const btnRec = document.getElementById('btn-record-video') as HTMLButtonElement;
    btnRec.onclick = async () => {
      if (!this.videoRecorder.getIsRecording()) {
        this.videoRecorder.startRecording(this.canvas);
        btnRec.textContent = '⏹ STOP';
        btnRec.classList.add('recording');
      } else {
        const blob = await this.videoRecorder.stopRecording();
        btnRec.textContent = '⏺ REC';
        btnRec.classList.remove('recording');

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sonification_glitch_${Date.now()}.webm`;
        a.click();
      }
    };
  }

  private stopVideoFile(): void {
    if (this.loadedVideoElement) {
      this.loadedVideoElement.pause();
      this.loadedVideoElement.src = '';
      this.loadedVideoElement = null;
    }
  }

  private loadedVideoElement: HTMLVideoElement | null = null;

  private loadVideoFromFile(file: File): void {
    this.cameraManager.stop();
    document.getElementById('btn-toggle-camera')!.textContent = '📹 Live Camera';
    document.getElementById('btn-toggle-camera')!.classList.remove('btn-primary');
    document.getElementById('btn-flip-camera')!.classList.add('hidden');

    this.stopVideoFile();

    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      video.play();
      this.loadedVideoElement = video;
      this.startVideoFileLoop();
    };
  }

  private startVideoFileLoop(): void {
    const loop = () => {
      if (this.loadedVideoElement && !this.loadedVideoElement.paused) {
        const v = this.loadedVideoElement;
        if (this.canvas.width !== v.videoWidth || this.canvas.height !== v.videoHeight) {
          this.canvas.width = v.videoWidth || 640;
          this.canvas.height = v.videoHeight || 480;
        }
        this.ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height);
        this.inputImageBuffer = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.processAndBlit();
        this.animFrameId = requestAnimationFrame(loop);
      }
    };
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(loop);
  }

  private loadImageFromFile(file: File): void {
    this.stopVideoFile();
    const img = new Image();
    img.onload = () => {
      this.cameraManager.stop();
      document.getElementById('btn-toggle-camera')!.textContent = '📹 Live Camera';
      document.getElementById('btn-toggle-camera')!.classList.remove('btn-primary');
      document.getElementById('btn-flip-camera')!.classList.add('hidden');

      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);
      this.inputImageBuffer = this.ctx.getImageData(0, 0, img.width, img.height);
      this.requestRender();
    };
    img.src = URL.createObjectURL(file);
  }

  private startLiveLoop(): void {
    const loop = () => {
      if (this.cameraManager.isActive()) {
        const video = this.cameraManager.getVideoElement();
        if (this.canvas.width !== video.videoWidth || this.canvas.height !== video.videoHeight) {
          this.canvas.width = video.videoWidth || 640;
          this.canvas.height = video.videoHeight || 480;
        }
        this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
        this.inputImageBuffer = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.processAndBlit();
        this.animFrameId = requestAnimationFrame(loop);
      }
    };
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(loop);
  }

  private requestRender(): void {
    if (!this.cameraManager.isActive()) {
      requestAnimationFrame(() => this.processAndBlit());
    }
  }

  private processAndBlit(): void {
    if (!this.inputImageBuffer) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    const res = this.pipeline.processFrame(
      this.inputImageBuffer.data,
      w,
      h,
      this.activePreset
    );

    const outImgData = this.ctx.createImageData(w, h);
    outImgData.data.set(res.outputRgba);
    this.ctx.putImageData(outImgData, 0, 0);

    // Feed audio samples to the Sound Camera audio engine
    this.audioEngine.playFrameSamples(res.audioSamples);

    // Update performance badge
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      this.frameCount = 0;
      this.lastTime = now;
      this.perfBadge.textContent = `${this.currentFps} FPS | ${res.executionTimeMs.toFixed(1)} ms (${w}×${h})`;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new SonificationApp();
});
