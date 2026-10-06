// Main application entry point for Sonification V2
// Updated with Photographic Studio aesthetic, Audio Rack / PCB hardware details, and Tactile Rotary Knobs
import type { ColorSpace, CompandingLaw, FilterId, RawType, SonificationPreset } from './types/index.ts';
import { SonificationPipeline } from './engine/pipeline.ts';
import { PresetManager } from './presets/preset-manager.ts';
import { FILTER_DESCRIPTORS } from './engine/filters/factory.ts';
import { SoundCameraAudio } from './audio/sound-camera.ts';
import { CameraManager } from './camera/camera-manager.ts';
import { VideoRecorder } from './record/video-recorder.ts';
import { RotaryKnob } from './components/rotary-knob.ts';

class SonificationApp {
  private pipeline = new SonificationPipeline();
  private presetManager = new PresetManager();
  private audioEngine = new SoundCameraAudio();
  private cameraManager = new CameraManager();
  private videoRecorder = new VideoRecorder();

  private activePreset!: SonificationPreset;

  // DOM Elements
  private canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private offscreenCanvas = document.createElement('canvas');
  private offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true })!;
  private scopeCanvas = document.getElementById('scope-canvas') as HTMLCanvasElement;
  private scopeCtx = this.scopeCanvas?.getContext('2d');
  private perfBadge = document.getElementById('perf-badge') as HTMLDivElement;

  private selectPreset = document.getElementById('select-preset') as HTMLSelectElement;
  private selectColorSpace = document.getElementById('select-colorspace') as HTMLSelectElement;
  private selectRawType = document.getElementById('select-rawtype') as HTMLSelectElement;
  private selectBitDepth = document.getElementById('select-bitdepth') as HTMLSelectElement;
  private selectLaw = document.getElementById('select-law') as HTMLSelectElement;
  private checkEqualize = document.getElementById('check-equalize') as HTMLInputElement;
  private selectResolution = document.getElementById('select-resolution') as HTMLSelectElement;

  private filterRackContainer = document.getElementById('filter-rack-container') as HTMLDivElement;

  private qrModal = document.getElementById('qr-modal') as HTMLDivElement;
  private qrImage = document.getElementById('qr-image') as HTMLImageElement;
  private addFilterModal = document.getElementById('add-filter-modal') as HTMLDivElement;
  private filterLibraryList = document.getElementById('filter-library-list') as HTMLDivElement;

  // Editorial Elements
  private fieldNoteTitle = document.getElementById('field-note-title');
  private fieldNoteDesc = document.getElementById('field-note-desc');
  private studyNumber = document.getElementById('study-number');
  private patchSeed = document.getElementById('patch-seed');
  private statusSeedCode = document.getElementById('status-seed-code');
  private statusResolution = document.getElementById('status-resolution');

  // Master Volume Rotary Knob
  private masterGainKnob!: RotaryKnob;

  private inputImageBuffer: ImageData | null = null;
  private animFrameId: number | null = null;

  private lastTime = performance.now();
  private frameCount = 0;
  private currentFps = 0;

  // Viewport Tab State
  private currentViewMode: 'developed' | 'exposure' | 'source' | 'scope' = 'developed';

  constructor() {
    this.initPreset();
    this.initCanvasPlaceholder();
    this.initMasterKnob();
    this.initDarkroomLogs();
    this.bindEvents();
    this.renderFilterRack();
    this.renderFilterLibrary();
    this.renderPresetDropdown();
  }

  private initPreset(): void {
    const hashPreset = this.presetManager.decodePresetFromHash(window.location.hash);
    if (hashPreset) {
      this.activePreset = hashPreset;
    } else {
      this.activePreset = JSON.parse(JSON.stringify(this.presetManager.getAllPresets()[0]));
    }
    this.syncFormWithPreset();
    this.updateEditorialHeaders();
  }

  private updateEditorialHeaders(): void {
    if (this.fieldNoteTitle) {
      const words = this.activePreset.name.split(' ');
      if (words.length > 1) {
        const last = words.pop();
        this.fieldNoteTitle.innerHTML = `${words.join(' ')} <em>${last}</em>.`;
      } else {
        this.fieldNoteTitle.innerHTML = `Drawn by <em>${this.activePreset.name}</em>.`;
      }
    }

    if (this.fieldNoteDesc && this.activePreset.description) {
      this.fieldNoteDesc.textContent = this.activePreset.description;
    }

    // Seed badge & study index
    const allPresets = this.presetManager.getAllPresets();
    const presetIdx = allPresets.findIndex((p) => p.id === this.activePreset.id);
    if (this.studyNumber) {
      this.studyNumber.textContent = String(Math.max(1, presetIdx + 1)).padStart(2, '0');
    }

    const seed = Math.abs(this.hashCode(this.activePreset.id)) % 9000 + 1000;
    if (this.patchSeed) this.patchSeed.textContent = String(seed);
    if (this.statusSeedCode) this.statusSeedCode.textContent = String(seed);
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
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
    const slot = document.getElementById('master-gain-knob-slot');
    if (slot) {
      this.masterGainKnob = new RotaryKnob({
        min: 0,
        max: 1,
        step: 0.01,
        value: 0.5,
        defaultValue: 0.5,
        label: 'GAIN',
        size: 40,
        onChange: (val) => {
          this.audioEngine.setVolume(val);
          const slider = document.getElementById('slider-volume') as HTMLInputElement;
          if (slider) slider.value = String(val);
        },
      });
      slot.appendChild(this.masterGainKnob.element);
    }
  }

  private syncFormWithPreset(): void {
    this.selectColorSpace.value = this.activePreset.reader.colorSpace;
    this.selectRawType.value = this.activePreset.reader.rawType;
    this.selectBitDepth.value = String(this.activePreset.reader.bits);
    this.selectLaw.value = this.activePreset.reader.law;
    this.checkEqualize.checked = this.activePreset.equalize;
    this.updateEditorialHeaders();
  }

  private renderPresetDropdown(): void {
    this.selectPreset.innerHTML = '';
    const presets = this.presetManager.getAllPresets();
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i];
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${String(i + 1).padStart(2, '0')} — ${p.name}`;
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
      title.textContent = `${String(idx + 1).padStart(2, '0')} / ${desc ? desc.name : filterConfig.type}`;

      const headerBtns = document.createElement('div');
      headerBtns.className = 'module-actions';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = `btn-hw ${filterConfig.enabled ? 'btn-hw-primary' : 'btn-hw-secondary'} btn-sm`;
      toggleBtn.textContent = filterConfig.enabled ? 'ON' : 'BYP';
      toggleBtn.title = 'Bypass or engage module';
      toggleBtn.onclick = () => {
        filterConfig.enabled = !filterConfig.enabled;
        this.renderFilterRack();
        this.requestRender();
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-hw btn-hw-secondary btn-sm';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove module from rack';
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
        paramsGrid.className = 'module-params-grid';

        for (const p of desc.params) {
          const val = filterConfig.params[p.name] !== undefined ? filterConfig.params[p.name] : p.value;

          const knob = new RotaryKnob({
            min: p.min,
            max: p.max,
            step: p.step,
            value: val,
            defaultValue: p.value,
            label: p.label.split(' ')[0], // Compact label
            size: 46,
            onChange: (newVal) => {
              filterConfig.params[p.name] = newVal;
              this.requestRender();
            },
          });

          paramsGrid.appendChild(knob.element);
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
          <div class="library-item-desc">${desc.description}</div>
        </div>
        <button class="btn-hw btn-hw-primary btn-sm" style="margin-top: 8px; align-self: flex-start;">+ Add to Rack</button>
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

    // Reset view button
    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
      this.initCanvasPlaceholder();
    });

    // Fullscreen button
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        this.canvas.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

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
        this.updateEditorialHeaders();
      }
    };

    // Export & Import Series JSON
    document.getElementById('btn-export-series')?.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.presetManager.getAllPresets(), null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `sonification_series_${Date.now()}.json`);
      downloadAnchor.click();
    });

    document.getElementById('btn-import-series')?.addEventListener('click', () => {
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
                imported.forEach((p) => this.presetManager.savePreset(p));
                this.renderPresetDropdown();
                alert(`Successfully imported ${imported.length} studies!`);
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

    if (this.selectResolution) {
      this.selectResolution.onchange = () => {
        this.liveResolution = this.selectResolution.value as '360p' | '480p' | '720p' | 'native';
        this.requestRender();
      };
    }

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
        btnCamera.classList.remove('btn-hw-primary');
        btnFlipCamera.classList.add('hidden');
      } else {
        try {
          await this.cameraManager.start(640, 480);
          btnCamera.textContent = '⏹ Stop Sensor';
          btnCamera.classList.add('btn-hw-primary');
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
    const audioLabel = document.getElementById('audio-btn-label');

    btnAudio.onclick = () => {
      this.audioEngine.init();
      const isMuted = !this.audioEngine.getMuted();
      this.audioEngine.setMuted(isMuted);
      if (audioLabel) {
        audioLabel.textContent = isMuted ? 'AUDIO: MUTED' : 'AUDIO: ENGAGED';
      }
      btnAudio.classList.toggle('active', !isMuted);
    };

    // Photo Snapshot (Shutter)
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
        btnRec.innerHTML = '<span class="rec-led"></span><span>⏹ STOP</span>';
        btnRec.classList.add('recording');
      } else {
        const blob = await this.videoRecorder.stopRecording();
        btnRec.innerHTML = '<span class="rec-led"></span><span>⏺ REC</span>';
        btnRec.classList.remove('recording');

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sonification_study_${Date.now()}.webm`;
        a.click();
      }
    };
  }

  private initDarkroomLogs(): void {
    const btnAdd = document.getElementById('btn-add-log-entry');
    const inputBatch = document.getElementById('log-input-batch') as HTMLInputElement;
    const inputExposure = document.getElementById('log-input-exposure') as HTMLInputElement;
    const inputProcess = document.getElementById('log-input-process') as HTMLInputElement;
    const inputResult = document.getElementById('log-input-result') as HTMLInputElement;
    const list = document.getElementById('darkroom-log-entries');
    const counter = document.getElementById('log-entry-count');

    const STORAGE_LOG_KEY = 'sonification_v2_darkroom_log';
    let logs: Array<{ batch: string; exposure: string; process: string; result: string; time: string }> = [];

    try {
      const saved = localStorage.getItem(STORAGE_LOG_KEY);
      if (saved) logs = JSON.parse(saved);
    } catch (_) {}

    const renderLogs = () => {
      if (!list) return;
      list.innerHTML = '';
      if (counter) counter.textContent = `${logs.length} ENTRIES`;
      logs.slice(-4).reverse().forEach((l) => {
        const div = document.createElement('div');
        div.className = 'log-entry-item';
        div.innerHTML = `<b>${l.time}</b> — ${l.batch || 'Batch'} | ${l.exposure || 'Direct'} | <em>${l.result || 'Active'}</em>`;
        list.appendChild(div);
      });
    };

    renderLogs();

    btnAdd?.addEventListener('click', () => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      logs.push({
        batch: inputBatch?.value || 'Study 01',
        exposure: inputExposure?.value || '44.1 kHz / 32-bit',
        process: inputProcess?.value || `${this.activePreset.reader.colorSpace} ${this.activePreset.reader.rawType}`,
        result: inputResult?.value || 'Observed timbre harmonics',
        time,
      });
      try {
        localStorage.setItem(STORAGE_LOG_KEY, JSON.stringify(logs));
      } catch (_) {}
      if (inputBatch) inputBatch.value = '';
      if (inputExposure) inputExposure.value = '';
      if (inputProcess) inputProcess.value = '';
      if (inputResult) inputResult.value = '';
      renderLogs();
    });
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
    const btnCam = document.getElementById('btn-toggle-camera');
    if (btnCam) {
      btnCam.textContent = '📹 Live Camera';
      btnCam.classList.remove('btn-hw-primary');
    }
    document.getElementById('btn-flip-camera')?.classList.add('hidden');

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

  private liveResolution: '360p' | '480p' | '720p' | 'native' = '480p';

  private getTargetDimensions(srcW: number, srcH: number): { w: number; h: number } {
    if (this.liveResolution === 'native') return { w: srcW, h: srcH };

    const targetH = this.liveResolution === '360p' ? 360 : this.liveResolution === '480p' ? 480 : 720;
    if (srcH <= targetH) return { w: srcW, h: srcH };

    const aspect = srcW / srcH;
    const targetW = Math.round(targetH * aspect);
    return { w: targetW, h: targetH };
  }

  private lastVideoTime = -1;

  private startVideoFileLoop(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    const v = this.loadedVideoElement;
    if (!v) return;

    this.lastVideoTime = -1;

    const onFrame = () => {
      if (!this.loadedVideoElement || this.loadedVideoElement.paused) return;
      const cur = this.loadedVideoElement;

      if (cur.readyState >= 2 && cur.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = cur.currentTime;
        const dims = this.getTargetDimensions(cur.videoWidth || 640, cur.videoHeight || 480);

        if (this.offscreenCanvas.width !== dims.w || this.offscreenCanvas.height !== dims.h) {
          this.offscreenCanvas.width = dims.w;
          this.offscreenCanvas.height = dims.h;
        }
        if (this.canvas.width !== dims.w || this.canvas.height !== dims.h) {
          this.canvas.width = dims.w;
          this.canvas.height = dims.h;
        }

        this.offscreenCtx.drawImage(cur, 0, 0, dims.w, dims.h);
        this.inputImageBuffer = this.offscreenCtx.getImageData(0, 0, dims.w, dims.h);
        this.processAndBlit();
      }

      if ('requestVideoFrameCallback' in cur) {
        (cur as any).requestVideoFrameCallback(onFrame);
      } else {
        this.animFrameId = requestAnimationFrame(onFrame);
      }
    };

    if ('requestVideoFrameCallback' in v) {
      (v as any).requestVideoFrameCallback(onFrame);
    } else {
      this.animFrameId = requestAnimationFrame(onFrame);
    }
  }

  private loadImageFromFile(file: File): void {
    this.stopVideoFile();
    const img = new Image();
    img.onload = () => {
      this.cameraManager.stop();
      const btnCam = document.getElementById('btn-toggle-camera');
      if (btnCam) {
        btnCam.textContent = '📹 Live Camera';
        btnCam.classList.remove('btn-hw-primary');
      }
      document.getElementById('btn-flip-camera')?.classList.add('hidden');

      this.offscreenCanvas.width = img.width;
      this.offscreenCanvas.height = img.height;
      this.canvas.width = img.width;
      this.canvas.height = img.height;

      this.offscreenCtx.drawImage(img, 0, 0);
      this.inputImageBuffer = this.offscreenCtx.getImageData(0, 0, img.width, img.height);
      this.requestRender();
    };
    img.src = URL.createObjectURL(file);
  }

  private startLiveLoop(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    const onFrame = () => {
      if (!this.cameraManager.isActive()) return;
      const video = this.cameraManager.getVideoElement();

      if (video.readyState >= 2) {
        const dims = this.getTargetDimensions(video.videoWidth || 640, video.videoHeight || 480);

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

      if ('requestVideoFrameCallback' in video) {
        (video as any).requestVideoFrameCallback(onFrame);
      } else {
        this.animFrameId = requestAnimationFrame(onFrame);
      }
    };

    const video = this.cameraManager.getVideoElement();
    if ('requestVideoFrameCallback' in video) {
      (video as any).requestVideoFrameCallback(onFrame);
    } else {
      this.animFrameId = requestAnimationFrame(onFrame);
    }
  }

  private requestRender(): void {
    if (!this.cameraManager.isActive() && !this.loadedVideoElement) {
      requestAnimationFrame(() => this.processAndBlit());
    }
  }

  private cachedImageData: ImageData | null = null;

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
      // Exposure map view: High contrast luminance difference
      const d = this.cachedImageData.data;
      const s = this.inputImageBuffer.data;
      for (let i = 0; i < d.length; i += 4) {
        const diffR = Math.abs(d[i] - s[i]);
        const diffG = Math.abs(d[i + 1] - s[i + 1]);
        const diffB = Math.abs(d[i + 2] - s[i + 2]);
        const luma = Math.min(255, (diffR + diffG + diffB) * 1.5);
        d[i] = luma > 128 ? 200 : 20;     // False color amber/olive
        d[i + 1] = luma > 64 ? 214 : 30;
        d[i + 2] = luma > 180 ? 101 : 15;
      }
    }

    this.ctx.putImageData(this.cachedImageData, 0, 0);

    // Audio transmission
    this.audioEngine.playFrameSamples(res.audioSamples);

    // Live Oscilloscope Render
    if (this.currentViewMode === 'scope' && this.scopeCtx) {
      this.renderOscilloscope();
    }

    // Performance telemetry
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
