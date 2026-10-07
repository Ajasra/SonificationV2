// Main application entry point for Sonification V2
// Updated with Photographic Studio aesthetic, Audio Rack / PCB hardware details, and Tactile Rotary Knobs
import type { ColorSpace, CompandingLaw, FilterId, RawType, SonificationPreset } from './types/index.ts';
import { SonificationPipeline } from './engine/pipeline.ts';
import { PresetManager } from './presets/preset-manager.ts';
import { FILTER_DESCRIPTORS } from './engine/filters/factory.ts';
import { SoundCameraAudio } from './audio/sound-camera.ts';
import { CameraManager } from './camera/camera-manager.ts';
import { VideoRecorder } from './record/video-recorder.ts';
import { OfflineVideoRecorder } from './record/offline-video-recorder.ts';
import { RotaryKnob } from './components/rotary-knob.ts';

class SonificationApp {
  private pipeline = new SonificationPipeline();
  private presetManager = new PresetManager();
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
  private perfBadge = document.getElementById('perf-badge') as HTMLDivElement;

  private selectPreset = document.getElementById('select-preset') as HTMLSelectElement;
  private inputPresetDesc = document.getElementById('input-preset-desc') as HTMLTextAreaElement;
  private btnPresetSave = document.getElementById('btn-preset-save') as HTMLButtonElement;
  private btnPresetUpdate = document.getElementById('btn-preset-update') as HTMLButtonElement;
  private btnPresetDelete = document.getElementById('btn-preset-delete') as HTMLButtonElement;
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
  private filterSearchInput = document.getElementById('filter-search-input') as HTMLInputElement | null;
  private filterSearchClear = document.getElementById('filter-search-clear') as HTMLButtonElement | null;
  private filterCategoryTabs = document.getElementById('filter-category-tabs') as HTMLDivElement | null;
  private activeLibraryCategory: string = 'all';
  private librarySearchQuery: string = '';
  private customMobileHost = '192.168.1.15:5173';

  // Editorial & Hardware Telemetry Elements
  private fieldNoteTitle = document.getElementById('field-note-title');
  private fieldNoteDesc = document.getElementById('field-note-desc');
  private studyNumber = document.getElementById('study-number');
  private patchSeed = document.getElementById('patch-seed');
  private busRate = document.getElementById('bus-rate');
  private statusSeedCode = document.getElementById('status-seed-code');
  private statusResolution = document.getElementById('status-resolution');

  // Interactive Seed and DAC Bus Clock
  private currentSeed = 4821;
  private static readonly BUS_RATES: { label: string; rate: number }[] = [
    { label: '8.0 kHz', rate: 8000 },
    { label: '11.0 kHz', rate: 11025 },
    { label: '22.05 kHz', rate: 22050 },
    { label: '32.0 kHz', rate: 32000 },
    { label: '44.1 kHz', rate: 44100 },
    { label: '48.0 kHz', rate: 48000 },
    { label: '96.0 kHz', rate: 96000 },
  ];
  private currentBusIndex = 4; // default: 44.1 kHz

  // Master Volume Rotary Knob
  private masterGainKnob!: RotaryKnob;

  private inputImageBuffer: ImageData | null = null;
  private animFrameId: number | null = null;
  private videoFrameId: number | null = null;
  private frameVideo: HTMLVideoElement | null = null;
  private loopGeneration = 0;
  private cameraBusy = false;

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

  private lastTime = performance.now();
  private frameCount = 0;
  private currentFps = 0;

  // Viewport Tab State
  private currentViewMode: 'developed' | 'exposure' | 'source' | 'scope' = 'developed';

  // Video recording timer state
  private recTimerInterval: number | null = null;
  private recStartTime = 0;

  // Fullscreen Sound Camera View State
  private isFullscreenMode = false;

  constructor() {
    this.initPreset();
    this.initCanvasPlaceholder();
    this.initMasterKnob();
    this.initCollapsibleCards();
    this.bindEvents();
    this.renderFilterRack();
    this.renderFilterLibrary();
    this.renderPresetDropdown();
    this.initMobileUI();
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
      else if (this.loadedVideoElement) this.startVideoFileLoop();
    });
  }

  private initPreset(): void {
    const hashPreset = this.presetManager.decodePresetFromHash(window.location.hash);
    if (hashPreset) {
      this.activePreset = hashPreset;
    } else {
      this.activePreset = JSON.parse(JSON.stringify(this.presetManager.getAllPresets()[0]));
    }
    this.currentSeed = Math.abs(this.hashCode(this.activePreset.id)) % 9000 + 1000;
    this.syncFormWithPreset();
    this.updateEditorialHeaders();
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  }

  private updateEditorialHeaders(): void {
    if (this.fieldNoteTitle) {
      const words = this.activePreset.name.split(' ');
      if (words.length > 1) {
        const last = words.pop();
        this.fieldNoteTitle.innerHTML = `${this.escapeHtml(words.join(' '))} <em>${this.escapeHtml(last!)}</em>.`;
      } else {
        this.fieldNoteTitle.innerHTML = `Drawn by <em>${this.escapeHtml(this.activePreset.name)}</em>.`;
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

    if (this.patchSeed) this.patchSeed.textContent = String(this.currentSeed);
    if (this.statusSeedCode) this.statusSeedCode.textContent = String(this.currentSeed);

    if (this.busRate) {
      this.busRate.textContent = SonificationApp.BUS_RATES[this.currentBusIndex].label;
    }
  }

  // Deterministic PRNG seeded by currentSeed to mutate active preset parameters
  private applySeed(newSeed: number): void {
    this.currentSeed = newSeed;
    let s = newSeed;
    const nextRandom = () => {
      // Linear congruential generator (LCG)
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    // Mutate all active DSP filter parameters according to seed
    for (const f of this.activePreset.filters) {
      const desc = FILTER_DESCRIPTORS[f.type];
      if (desc) {
        for (const p of desc.params) {
          f.params[p.name] = p.min + nextRandom() * (p.max - p.min);
        }
      }
    }

    // Refresh UI & DSP rack
    this.updateEditorialHeaders();
    this.renderFilterRack();
    this.requestRender();

    // Subtle tactile flash on the seed badge
    if (this.patchSeed) {
      this.patchSeed.style.color = '#fff';
      setTimeout(() => {
        if (this.patchSeed) this.patchSeed.style.color = '';
      }, 300);
    }
  }

  // Change DAC / BUS sample rate across audio playback engine and filter chain
  private setBusRateIndex(idx: number): void {
    this.currentBusIndex = (idx + SonificationApp.BUS_RATES.length) % SonificationApp.BUS_RATES.length;
    const busConfig = SonificationApp.BUS_RATES[this.currentBusIndex];
    
    // 1. Update audio engine playback clock
    this.audioEngine.setSampleRate(busConfig.rate);

    // 2. Update all active filters' sample rates in preset
    for (const f of this.activePreset.filters) {
      f.sampleRate = busConfig.rate;
    }

    // 3. Update header display
    if (this.busRate) {
      this.busRate.textContent = busConfig.label;
      this.busRate.style.color = '#fff';
      setTimeout(() => {
        if (this.busRate) this.busRate.style.color = '';
      }, 300);
    }

    // 4. Force re-sync of DSP pipeline and render
    this.requestRender();
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
        size: 32,
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
    if (this.inputPresetDesc) {
      this.inputPresetDesc.value = this.activePreset.description || '';
    }
    this.updatePresetButtonsState();
    this.updateEditorialHeaders();
  }

  private updatePresetButtonsState(): void {
    const isFactory = this.presetManager.isFactoryPreset(this.activePreset.id);
    if (this.btnPresetDelete) {
      this.btnPresetDelete.disabled = isFactory;
      this.btnPresetDelete.title = isFactory
        ? 'Factory studies cannot be deleted'
        : 'Delete this custom study';
    }
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
    this.updatePresetButtonsState();
    this.renderMobilePresetDrawer();
    this.updateMobilePresetBadge();
  }

  private static readonly CATEGORY_SHORT_NAMES: Record<string, string> = {
    dynamics: 'DYN',
    eq: 'EQ',
    delay: 'DELAY',
    modulation: 'MOD',
    synth: 'SYNTH',
    distortion: 'DIST',
    lofi: 'LO-FI',
  };

  private static readonly CATEGORY_SECTIONS: { id: string; label: string }[] = [
    { id: 'dynamics', label: 'DYNAMICS & LEVEL' },
    { id: 'eq', label: 'EQ & SPECTRAL' },
    { id: 'delay', label: 'DELAY & SPACE' },
    { id: 'modulation', label: 'MODULATION' },
    { id: 'synth', label: 'SYNTHESIS' },
    { id: 'distortion', label: 'DISTORTION' },
    { id: 'lofi', label: 'LO-FI' },
  ];

  private renderFilterRack(): void {
    this.filterRackContainer.innerHTML = '';

    this.activePreset.filters.forEach((filterConfig, idx) => {
      const desc = FILTER_DESCRIPTORS[filterConfig.type];
      const card = document.createElement('div');
      card.className = 'rack-module';

      const header = document.createElement('div');
      header.className = 'module-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'module-title-group';

      const catBadge = document.createElement('span');
      const catKey = desc ? desc.category : 'distortion';
      catBadge.className = `module-cat-pill cat-${catKey}`;
      catBadge.textContent = SonificationApp.CATEGORY_SHORT_NAMES[catKey] || catKey.toUpperCase();
      catBadge.title = `Category: ${catKey.toUpperCase()}`;

      const title = document.createElement('span');
      title.className = 'module-title-text';
      title.textContent = `${String(idx + 1).padStart(2, '0')} / ${desc ? desc.name : filterConfig.type}`;

      titleGroup.appendChild(catBadge);
      titleGroup.appendChild(title);

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
      header.appendChild(titleGroup);
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
            size: 34,
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
    const query = this.librarySearchQuery.toLowerCase().trim();
    const activeCat = this.activeLibraryCategory;

    // Filter by search query and category
    const filteredKeys = keys.filter((key) => {
      const desc = FILTER_DESCRIPTORS[key];
      if (activeCat !== 'all' && desc.category !== activeCat) {
        return false;
      }
      if (query) {
        const matchName = desc.name.toLowerCase().includes(query);
        const matchDesc = desc.description.toLowerCase().includes(query);
        const matchCat = desc.category.toLowerCase().includes(query);
        const matchId = desc.id.toLowerCase().includes(query);
        return matchName || matchDesc || matchCat || matchId;
      }
      return true;
    });

    if (filteredKeys.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'library-empty-state';
      empty.innerHTML = `
        <div style="font-size: 1.6rem; margin-bottom: 8px;">🔍</div>
        <div style="color: var(--text-primary); font-weight: 600;">No DSP modules found</div>
        <div style="margin-top: 4px; font-size: 0.68rem; color: var(--text-muted);">No modules matched "${query || activeCat}"</div>
        <button class="btn-hw btn-hw-secondary btn-sm" style="margin-top: 12px;" id="btn-reset-library-search">Reset Filters</button>
      `;
      this.filterLibraryList.appendChild(empty);
      empty.querySelector('#btn-reset-library-search')?.addEventListener('click', () => {
        if (this.filterSearchInput) this.filterSearchInput.value = '';
        this.librarySearchQuery = '';
        this.activeLibraryCategory = 'all';
        if (this.filterSearchClear) this.filterSearchClear.classList.add('hidden');
        if (this.filterCategoryTabs) {
          this.filterCategoryTabs.querySelectorAll('.filter-cat-btn').forEach((b) => {
            b.classList.toggle('active', (b as HTMLElement).dataset.cat === 'all');
          });
        }
        this.renderFilterLibrary();
      });
      return;
    }

    // Group items by category if displaying 'all' or if multiple categories match query
    const categoriesToRender = activeCat === 'all'
      ? SonificationApp.CATEGORY_SECTIONS
      : SonificationApp.CATEGORY_SECTIONS.filter((s) => s.id === activeCat);

    for (const catSection of categoriesToRender) {
      const catKeys = filteredKeys.filter((k) => FILTER_DESCRIPTORS[k].category === catSection.id);
      if (catKeys.length === 0) continue;

      // Render group header
      const groupHeader = document.createElement('div');
      groupHeader.className = 'library-group-section';
      groupHeader.innerHTML = `
        <span class="library-group-title cat-${catSection.id}">[ ${catSection.label} ]</span>
        <span class="library-group-count">(${catKeys.length})</span>
      `;
      this.filterLibraryList.appendChild(groupHeader);

      for (const key of catKeys) {
        const desc = FILTER_DESCRIPTORS[key];
        const item = document.createElement('div');
        item.className = 'library-item';
        item.innerHTML = `
          <div>
            <div class="library-item-header">
              <b class="library-item-title">${desc.name}</b>
              <span class="library-item-badge cat-${desc.category}">${desc.category.toUpperCase()}</span>
            </div>
            <div class="library-item-desc">${desc.description}</div>
          </div>
          <div class="library-item-footer">
            <span class="library-item-meta">${desc.params.length} control${desc.params.length === 1 ? '' : 's'}</span>
            <button class="btn-library-add" title="Add ${desc.name} to rack">+</button>
          </div>
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

    // Fullscreen button (Toggles immersive minimal sound camera mode)
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      this.setFullscreenMode(!this.isFullscreenMode, true);
    });

    document.addEventListener('fullscreenchange', () => {
      const isNativeFs = !!document.fullscreenElement;
      // If native fullscreen was exited via ESC on desktop
      if (!isNativeFs && !this.isMobileDevice()) {
        this.setFullscreenMode(false, false);
      }
    });

    // Interactive Telemetry Header: Click SEED to randomize, click BUS to cycle clock rates
    const btnHeroSeed = document.getElementById('btn-hero-seed');
    if (btnHeroSeed) {
      btnHeroSeed.onclick = () => {
        const randomSeed = Math.floor(1000 + Math.random() * 9000);
        this.applySeed(randomSeed);
      };
    }

    const btnHeroBus = document.getElementById('btn-hero-bus');
    if (btnHeroBus) {
      btnHeroBus.onclick = () => {
        this.setBusRateIndex(this.currentBusIndex + 1);
      };
    }

    // Preset dropdown selection
    this.selectPreset.onchange = () => {
      const found = this.presetManager.getPresetById(this.selectPreset.value);
      if (found) {
        this.activePreset = JSON.parse(JSON.stringify(found));
        this.syncFormWithPreset();
        this.renderFilterRack();
        this.requestRender();
      }
    };

    // Preset description editing
    if (this.inputPresetDesc) {
      this.inputPresetDesc.oninput = () => {
        this.activePreset.description = this.inputPresetDesc.value;
        if (this.fieldNoteDesc) {
          this.fieldNoteDesc.textContent = this.activePreset.description;
        }
      };
    }

    // Save as New custom study
    if (this.btnPresetSave) {
      this.btnPresetSave.onclick = () => {
        const defaultName = this.activePreset.name.endsWith('(Copy)') 
          ? this.activePreset.name 
          : `${this.activePreset.name} (Copy)`;
        const name = prompt('New Study Name:', defaultName);
        if (name && name.trim()) {
          const newPreset: SonificationPreset = JSON.parse(JSON.stringify(this.activePreset));
          newPreset.id = 'usr_' + Date.now();
          newPreset.name = name.trim();
          newPreset.description = this.inputPresetDesc ? this.inputPresetDesc.value : (newPreset.description || '');
          this.activePreset = newPreset;
          this.presetManager.savePreset(this.activePreset);
          this.renderPresetDropdown();
          this.updateEditorialHeaders();
        }
      };
    }

    // Update current active study
    if (this.btnPresetUpdate) {
      this.btnPresetUpdate.onclick = () => {
        const isFactory = this.presetManager.isFactoryPreset(this.activePreset.id);
        if (isFactory) {
          // If trying to overwrite a factory preset, prompt user to save as a custom study
          const newName = prompt(
            'Factory studies are read-only. Enter a name to save as your custom study:',
            `${this.activePreset.name} (Custom)`
          );
          if (newName && newName.trim()) {
            this.activePreset.id = 'usr_' + Date.now();
            this.activePreset.name = newName.trim();
            if (this.inputPresetDesc) {
              this.activePreset.description = this.inputPresetDesc.value;
            }
            this.presetManager.savePreset(this.activePreset);
            this.renderPresetDropdown();
            this.updateEditorialHeaders();
          }
          return;
        }

        // Update custom preset in-place
        if (this.inputPresetDesc) {
          this.activePreset.description = this.inputPresetDesc.value;
        }
        this.presetManager.savePreset(this.activePreset);
        this.renderPresetDropdown();
        this.updateEditorialHeaders();

        // Visual flash feedback on the Update button
        const prevText = this.btnPresetUpdate.textContent;
        this.btnPresetUpdate.textContent = 'Updated ✓';
        this.btnPresetUpdate.style.borderColor = 'var(--accent-phosphor)';
        this.btnPresetUpdate.style.color = 'var(--accent-phosphor)';
        setTimeout(() => {
          this.btnPresetUpdate.textContent = prevText;
          this.btnPresetUpdate.style.borderColor = '';
          this.btnPresetUpdate.style.color = '';
        }, 1200);
      };
    }

    // Delete current custom study
    if (this.btnPresetDelete) {
      this.btnPresetDelete.onclick = () => {
        const isFactory = this.presetManager.isFactoryPreset(this.activePreset.id);
        if (isFactory) {
          alert('Factory studies cannot be deleted.');
          return;
        }

        if (confirm(`Delete study "${this.activePreset.name}"?`)) {
          this.presetManager.deletePreset(this.activePreset.id);
          const remaining = this.presetManager.getAllPresets();
          this.activePreset = JSON.parse(JSON.stringify(remaining[0]));
          this.syncFormWithPreset();
          this.renderFilterRack();
          this.renderPresetDropdown();
          this.requestRender();
        }
      };
    }

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
        if (this.loadedImageElement) {
          this.refreshLoadedImage();
        } else {
          this.requestRender();
        }
      };
    }

    // Filter Library Search & Category Tabs
    if (this.filterSearchInput) {
      this.filterSearchInput.oninput = () => {
        this.librarySearchQuery = this.filterSearchInput?.value.trim().toLowerCase() || '';
        if (this.filterSearchClear) {
          this.filterSearchClear.classList.toggle('hidden', !this.librarySearchQuery);
        }
        this.renderFilterLibrary();
      };
    }

    if (this.filterSearchClear) {
      this.filterSearchClear.onclick = () => {
        if (this.filterSearchInput) {
          this.filterSearchInput.value = '';
        }
        this.librarySearchQuery = '';
        this.filterSearchClear?.classList.add('hidden');
        this.renderFilterLibrary();
        this.filterSearchInput?.focus();
      };
    }

    if (this.filterCategoryTabs) {
      const catBtns = this.filterCategoryTabs.querySelectorAll<HTMLButtonElement>('.filter-cat-btn');
      catBtns.forEach((btn) => {
        btn.onclick = () => {
          catBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.activeLibraryCategory = btn.dataset.cat || 'all';
          this.renderFilterLibrary();
        };
      });
    }

    // Add filter modal
    document.getElementById('btn-add-filter')!.onclick = () => {
      this.addFilterModal.classList.remove('hidden');
      if (this.filterSearchInput) {
        setTimeout(() => this.filterSearchInput?.focus(), 100);
      }
    };
    document.getElementById('btn-close-filter-modal')!.onclick = () => {
      this.addFilterModal.classList.add('hidden');
    };

    // QR Code modal
    document.getElementById('btn-qr-modal')!.onclick = async () => {
      await this.updateQrModal();
      this.qrModal.classList.remove('hidden');
    };
    document.getElementById('btn-close-qr')!.onclick = () => {
      this.qrModal.classList.add('hidden');
    };
    const btnApplyHost = document.getElementById('btn-apply-host');
    const hostInput = document.getElementById('input-custom-host') as HTMLInputElement | null;
    if (btnApplyHost && hostInput) {
      const applyHostFn = async () => {
        const val = hostInput.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (val) {
          this.customMobileHost = val;
          await this.updateQrModal();
        }
      };
      btnApplyHost.onclick = applyHostFn;
      hostInput.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await applyHostFn();
        }
      };
    }
    document.getElementById('btn-copy-link')!.onclick = () => {
      let baseUrl = window.location.origin + window.location.pathname;
      if (this.customMobileHost) {
        baseUrl = `https://${this.customMobileHost}${window.location.pathname}`;
      } else if (baseUrl.startsWith('http://')) {
        baseUrl = baseUrl.replace(/^http:\/\//, 'https://');
      }
      const hash = this.presetManager.encodePresetToHash(this.activePreset);
      navigator.clipboard.writeText(baseUrl + hash);
      alert('Preset link copied to clipboard!');
    };

    window.addEventListener('hashchange', () => {
      const hashPreset = this.presetManager.decodePresetFromHash(window.location.hash);
      if (hashPreset) {
        this.activePreset = hashPreset;
        this.syncFormWithPreset();
        this.updateEditorialHeaders();
        this.renderPresetDropdown();
        this.renderFilterRack();
        this.requestRender();
      }
    });

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

    btnCamera.onclick = () => { void this.toggleLiveCameraFeed(); };
    btnFlipCamera.onclick = () => { void this.flipCamera(); };

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

    // Photo Snapshot (Shutter) — Always Exports Full Resolution
    document.getElementById('btn-shutter')!.onclick = () => {
      this.triggerShutterSnapshot();
    };

    // Hardware SYNC Toggle (Real-time live recording vs Offline frame-by-frame compaction)
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

    // Cancel button in Offline Frame Render HUD
    const btnCancelRender = document.getElementById('btn-cancel-render') as HTMLButtonElement;
    if (btnCancelRender) {
      btnCancelRender.onclick = () => {
        if (this.offlineVideoRecorder.getIsRunning()) {
          this.offlineVideoRecorder.cancel();
        }
      };
    }

    // Video Recording — Supports both Real-Time (SYNC ON) and Offline Frame Compaction (SYNC OFF)
    const btnRec = document.getElementById('btn-record-video') as HTMLButtonElement;
    if (btnRec) {
      btnRec.onclick = () => this.toggleVideoRecording();
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

  private async startOfflineVideoRecording(): Promise<void> {
    if (!this.loadedVideoElement) return;

    const v = this.loadedVideoElement;
    const btnRec = document.getElementById('btn-record-video') as HTMLButtonElement;
    const recText = document.getElementById('rec-btn-text');
    const progressOverlay = document.getElementById('render-progress-overlay');
    const progressFill = document.getElementById('render-progress-bar-fill');
    const progressCounter = document.getElementById('render-progress-counter');
    const progressFps = document.getElementById('render-progress-fps');

    // Make sure dimensions match current preview resolution (or native) and are even
    const dims = this.getTargetDimensions(v.videoWidth || 640, v.videoHeight || 480);
    const w = dims.w & ~1;
    const h = dims.h & ~1;
    this.canvas.width = w;
    this.canvas.height = h;
    this.offscreenCanvas.width = w;
    this.offscreenCanvas.height = h;

    btnRec.classList.add('recording');
    if (recText) recText.textContent = 'STOP';
    progressOverlay?.classList.remove('hidden');
    if (progressFill) progressFill.style.width = '0%';
    if (progressCounter) progressCounter.textContent = '0 / 0 (0%)';
    if (progressFps) progressFps.textContent = 'STARTING OFFLINE RENDER • TARGET: 30 FPS';

    try {
      const res = await this.offlineVideoRecorder.render({
        video: v,
        canvas: this.canvas,
        pipeline: this.pipeline,
        activePreset: this.activePreset,
        targetFps: 30,
        audioSampleRate: SonificationApp.BUS_RATES[this.currentBusIndex].rate,
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
      btnRec.classList.remove('recording');
      if (recText) recText.textContent = 'REC';
      this.startVideoFileLoop();
    }
  }

  private stopVideoFile(): void {
    this.stopFrameLoop();
    if (this.loadedVideoElement) {
      this.loadedVideoElement.pause();
      URL.revokeObjectURL(this.loadedVideoElement.src);
      this.loadedVideoElement.src = '';
      this.loadedVideoElement = null;
    }
  }

  private loadedVideoElement: HTMLVideoElement | null = null;

  private loadVideoFromFile(file: File): void {
    this.cameraManager.stop();
    const btnCam = document.getElementById('btn-toggle-camera');
    if (btnCam) {
      btnCam.textContent = 'Live camera';
      btnCam.classList.remove('btn-hw-primary');
    }
    document.getElementById('btn-flip-camera')?.classList.add('hidden');

    this.stopVideoFile();
    this.loadedImageElement = null;

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
    if (this.liveResolution === 'native') return { w: Math.max(2, srcW & ~1), h: Math.max(2, srcH & ~1) };

    const targetH = this.liveResolution === '360p' ? 360 : this.liveResolution === '480p' ? 480 : 720;
    if (srcH <= targetH) return { w: Math.max(2, srcW & ~1), h: Math.max(2, srcH & ~1) };

    const aspect = srcW / srcH;
    const targetW = Math.round(targetH * aspect);
    return { w: Math.max(2, targetW & ~1), h: Math.max(2, targetH & ~1) };
  }

  private lastVideoTime = -1;

  private startVideoFileLoop(): void {
    this.stopFrameLoop();
    const generation = this.loopGeneration;

    const v = this.loadedVideoElement;
    if (!v) return;

    this.lastVideoTime = -1;

    const onFrame = () => {
      if (generation !== this.loopGeneration || this.loadedVideoElement !== v || v.paused) return;
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

      this.scheduleFrame(cur, onFrame);
    };

    this.scheduleFrame(v, onFrame);
  }

  private loadedImageElement: HTMLImageElement | null = null;

  private refreshLoadedImage(): void {
    if (!this.loadedImageElement) return;
    const img = this.loadedImageElement;
    const dims = this.getTargetDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height);

    if (this.offscreenCanvas.width !== dims.w || this.offscreenCanvas.height !== dims.h) {
      this.offscreenCanvas.width = dims.w;
      this.offscreenCanvas.height = dims.h;
    }
    if (this.canvas.width !== dims.w || this.canvas.height !== dims.h) {
      this.canvas.width = dims.w;
      this.canvas.height = dims.h;
    }

    this.offscreenCtx.drawImage(img, 0, 0, dims.w, dims.h);
    this.inputImageBuffer = this.offscreenCtx.getImageData(0, 0, dims.w, dims.h);
    this.processAndBlit();
  }

  private loadImageFromFile(file: File): void {
    this.stopVideoFile();
    const img = new Image();
    img.onload = () => {
      this.cameraManager.stop();
      const btnCam = document.getElementById('btn-toggle-camera');
      if (btnCam) {
        btnCam.textContent = 'Live camera';
        btnCam.classList.remove('btn-hw-primary');
      }
      document.getElementById('btn-flip-camera')?.classList.add('hidden');

      this.loadedImageElement = img;
      this.refreshLoadedImage();
    };
    img.src = URL.createObjectURL(file);
  }

  private saveFullResolutionSnapshot(): void {
    let fullW = this.canvas.width;
    let fullH = this.canvas.height;
    let sourceDrawable: CanvasImageSource = this.canvas;

    if (this.loadedImageElement) {
      fullW = this.loadedImageElement.naturalWidth || this.loadedImageElement.width;
      fullH = this.loadedImageElement.naturalHeight || this.loadedImageElement.height;
      sourceDrawable = this.loadedImageElement;
    } else if (this.loadedVideoElement) {
      fullW = this.loadedVideoElement.videoWidth || fullW;
      fullH = this.loadedVideoElement.videoHeight || fullH;
      sourceDrawable = this.loadedVideoElement;
    } else if (this.cameraManager.isActive()) {
      const cam = this.cameraManager.getVideoElement();
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

    this.pipeline.processFrame(
      srcData.data,
      fullW,
      fullH,
      this.activePreset,
      outData.data
    );

    exportCtx.putImageData(outData, 0, 0);

    const link = document.createElement('a');
    link.download = `sonification_${fullW}x${fullH}_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  private triggerShutterSnapshot(): void {
    // Flash visual feedback on mobile viewfinder
    const flash = document.getElementById('mobile-shutter-flash');
    if (flash) {
      flash.classList.add('flashing');
      setTimeout(() => flash.classList.remove('flashing'), 120);
    }
    this.saveFullResolutionSnapshot();
  }

  private async toggleVideoRecording(): Promise<void> {
    const btnRec = document.getElementById('btn-record-video') as HTMLButtonElement | null;
    const btnMobileRec = document.getElementById('btn-mobile-rec') as HTMLButtonElement | null;
    const recText = document.getElementById('rec-btn-text');
    const recTimerBadge = document.getElementById('rec-timer-badge');
    const recTimeDisplay = document.getElementById('rec-time-display');
    const mobileRecBadge = document.getElementById('mobile-rec-badge');
    const mobileRecTimer = document.getElementById('mobile-rec-timer');

    // If currently running an offline render, pressing STOP finishes and exports what has been processed so far
    if (this.offlineVideoRecorder.getIsRunning()) {
      this.offlineVideoRecorder.stopEarly();
      return;
    }

    // If SYNC is OFF and a video file is currently loaded: Run deterministic frame-by-frame offline render!
    if (!this.isSyncMode && this.loadedVideoElement) {
      await this.startOfflineVideoRecording();
      return;
    }

    // Otherwise, standard real-time recording (live camera or video file with SYNC ON)
    if (!this.videoRecorder.getIsRecording()) {
      // Ensure canvas has even dimensions for hardware encoder before recording begins
      this.canvas.width = Math.max(2, this.canvas.width & ~1);
      this.canvas.height = Math.max(2, this.canvas.height & ~1);

      this.audioEngine.setIsRecording(true);
      this.videoRecorder.startRecording(this.canvas, this.audioEngine.getAudioMediaStream());
      btnRec?.classList.add('recording');
      btnMobileRec?.classList.add('recording');
      if (recText) recText.textContent = 'STOP';

      // Start live camera elapsed recording timer
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

      const { blob, ext } = await this.videoRecorder.stopRecording();
      this.audioEngine.setIsRecording(false);
      btnRec?.classList.remove('recording');
      btnMobileRec?.classList.remove('recording');
      if (recText) recText.textContent = 'REC';

      // On mobile devices, offer native Web Share if supported so users can save directly to Photos / Camera roll
      if (this.isMobileDevice() && typeof navigator.share === 'function') {
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

  private renderMobilePresetDrawer(): void {
    const list = document.getElementById('mobile-preset-list');
    if (!list) return;
    list.innerHTML = '';
    const presets = this.presetManager.getAllPresets();
    for (const p of presets) {
      const item = document.createElement('div');
      const isActive = p.id === this.activePreset.id;
      item.className = `mobile-preset-item ${isActive ? 'active' : ''}`;
      item.innerHTML = `
        <div class="mobile-preset-item-header">
          <span class="mobile-preset-item-name">${this.escapeHtml(p.name)}</span>
          ${isActive ? '<span class="mobile-preset-check">✓</span>' : ''}
        </div>
        ${p.description ? `<p class="mobile-preset-item-desc">${this.escapeHtml(p.description)}</p>` : ''}
      `;
      item.onclick = () => {
        this.activePreset = JSON.parse(JSON.stringify(p));
        this.syncFormWithPreset();
        this.updateEditorialHeaders();
        this.renderPresetDropdown();
        this.renderFilterRack();
        this.requestRender();
        this.closeMobileDrawer();
      };
      list.appendChild(item);
    }
  }

  private updateMobilePresetBadge(): void {
    const nameEl = document.getElementById('mobile-preset-name');
    if (nameEl) {
      nameEl.textContent = this.activePreset.name;
    }
  }

  private openMobileDrawer(): void {
    document.getElementById('mobile-preset-drawer')?.classList.add('open');
    document.getElementById('mobile-drawer-backdrop')?.classList.remove('hidden');
    document.getElementById('mobile-drawer-backdrop')?.classList.add('open');
  }

  private closeMobileDrawer(): void {
    document.getElementById('mobile-preset-drawer')?.classList.remove('open');
    document.getElementById('mobile-drawer-backdrop')?.classList.remove('open');
    setTimeout(() => {
      document.getElementById('mobile-drawer-backdrop')?.classList.add('hidden');
    }, 250);
  }

  private isMobileDevice(): boolean {
    return (
      window.innerWidth <= 900 ||
      /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );
  }

  private setFullscreenMode(enabled: boolean, requestBrowserFs = false): void {
    this.isFullscreenMode = enabled;
    document.body.classList.toggle('is-fullscreen', enabled);
    const appEl = document.getElementById('app');
    appEl?.classList.toggle('is-fullscreen', enabled);

    if (requestBrowserFs) {
      if (enabled) {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
      } else {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    }
  }

  private updateCamToggleUI(isActive: boolean): void {
    const badgeText = document.getElementById('mobile-cam-badge-text');
    const badge = document.getElementById('btn-mobile-cam-feed');
    const startOverlay = document.getElementById('mobile-start-overlay');
    if (badgeText) {
      badgeText.textContent = isActive ? 'CAM: LIVE' : 'START CAM';
    }
    if (badge) {
      badge.classList.toggle('active', isActive);
    }
    if (isActive) {
      startOverlay?.classList.add('hidden');
    } else if (this.isMobileDevice()) {
      startOverlay?.classList.remove('hidden');
    }
  }

  private async startLiveCameraFeed(): Promise<boolean> {
    if (this.cameraBusy || document.hidden) return false;
    this.cameraBusy = true;
    try {
      this.stopVideoFile();
      this.loadedImageElement = null;
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

  private initMobileUI(): void {
    const isMobile = this.isMobileDevice();

    // On phone / mobile device: triggers fullscreen view by default!
    if (isMobile) {
      this.setFullscreenMode(true, false);
      // Attempt immediate live camera activation
      this.startLiveCameraFeed().catch(() => {});
    }

    // Burger button opens drawer
    document.getElementById('btn-mobile-burger')?.addEventListener('click', () => {
      this.openMobileDrawer();
    });

    // Preset pill in top bar opens drawer
    document.getElementById('btn-mobile-preset-pill')?.addEventListener('click', () => {
      this.openMobileDrawer();
    });

    // Live camera toggle button in mobile top bar
    document.getElementById('btn-mobile-cam-feed')?.addEventListener('click', async () => {
      if (window.location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        if (confirm('iOS Safari blocks camera over plain HTTP.\nReload page using secure HTTPS?')) {
          window.location.href = window.location.href.replace('http:', 'https:');
        }
        return;
      }
      await this.toggleLiveCameraFeed();
    });

    // Drawer "Switch to Live Camera" button
    document.getElementById('btn-drawer-camera')?.addEventListener('click', async () => {
      if (window.location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        window.location.href = window.location.href.replace('http:', 'https:');
        return;
      }
      await this.startLiveCameraFeed();
      this.closeMobileDrawer();
    });

    // Close drawer buttons
    document.getElementById('btn-close-mobile-drawer')?.addEventListener('click', () => {
      this.closeMobileDrawer();
    });
    document.getElementById('mobile-drawer-backdrop')?.addEventListener('click', () => {
      this.closeMobileDrawer();
    });

    // Shutter button (Make picture)
    document.getElementById('btn-mobile-shutter')?.addEventListener('click', () => {
      this.triggerShutterSnapshot();
    });

    // Record Video button (Record video)
    document.getElementById('btn-mobile-rec')?.addEventListener('click', () => {
      this.toggleVideoRecording();
    });

    // Flip Camera button
    document.getElementById('btn-mobile-flip')?.addEventListener('click', async () => {
      await this.flipCamera();
    });

    // Audio Output toggle on mobile
    const btnMobileAudio = document.getElementById('btn-mobile-audio');
    const iconOn = document.getElementById('mobile-audio-icon-on');
    const iconOff = document.getElementById('mobile-audio-icon-off');
    const labelAudio = document.getElementById('mobile-audio-label');
    const updateAudioMobileUI = () => {
      const muted = this.audioEngine.getMuted();
      if (muted) {
        iconOn?.classList.add('hidden');
        iconOff?.classList.remove('hidden');
        if (labelAudio) labelAudio.textContent = 'MUTED';
        btnMobileAudio?.classList.remove('active');
      } else {
        iconOff?.classList.add('hidden');
        iconOn?.classList.remove('hidden');
        if (labelAudio) labelAudio.textContent = 'SOUND';
        btnMobileAudio?.classList.add('active');
      }
    };

    btnMobileAudio?.addEventListener('click', () => {
      this.audioEngine.init();
      const isMuted = !this.audioEngine.getMuted();
      this.audioEngine.setMuted(isMuted);
      updateAudioMobileUI();
    });

    // Fullscreen toggle on mobile
    document.getElementById('btn-mobile-fullscreen')?.addEventListener('click', () => {
      this.setFullscreenMode(!this.isFullscreenMode, true);
    });

    // Mobile volume slider
    const mobileVol = document.getElementById('mobile-slider-volume') as HTMLInputElement | null;
    if (mobileVol) {
      mobileVol.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        this.audioEngine.setVolume(val);
        if (this.masterGainKnob) {
          this.masterGainKnob.setValue(val);
        }
      });
    }

    // Mobile resolution selector
    const mobileRes = document.getElementById('mobile-select-resolution') as HTMLSelectElement | null;
    if (mobileRes) {
      mobileRes.addEventListener('change', () => {
        this.liveResolution = mobileRes.value as any;
        this.selectResolution.value = mobileRes.value;
        this.requestRender();
      });
    }

    // Toggle full desktop rack from mobile drawer
    document.getElementById('btn-mobile-desktop-toggle')?.addEventListener('click', () => {
      document.getElementById('app')?.classList.toggle('show-desktop-rack');
      this.closeMobileDrawer();
    });

    // Tap to start overlay on mobile
    const startOverlay = document.getElementById('mobile-start-overlay');
    const isHttpOnLan = window.location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isHttpOnLan && startOverlay) {
      const cardTitle = startOverlay.querySelector('.start-title');
      const cardDesc = startOverlay.querySelector('.start-desc');
      const cardBtn = document.getElementById('btn-start-camera-prompt');
      if (cardTitle) cardTitle.textContent = 'HTTPS REQUIRED FOR CAMERA';
      if (cardDesc) cardDesc.textContent = 'iOS Safari blocks camera over HTTP. Tap to switch to HTTPS:';
      if (cardBtn) cardBtn.textContent = 'RELOAD ON HTTPS ↗';
    }

    const activateMobileCamera = async () => {
      if (isHttpOnLan) {
        window.location.href = window.location.href.replace('http:', 'https:');
        return;
      }
      try {
        this.setFullscreenMode(true, true);
        this.audioEngine.init();
        this.audioEngine.setMuted(false);
        updateAudioMobileUI();
        await this.startLiveCameraFeed();
      } catch (err) {
        console.error('Camera start failed on gesture:', err);
      }
    };

    if (startOverlay) {
      if (!isMobile) {
        startOverlay.classList.add('hidden');
      } else {
        startOverlay.addEventListener('click', activateMobileCamera);
        document.getElementById('btn-start-camera-prompt')?.addEventListener('click', (e) => {
          e.stopPropagation();
          activateMobileCamera();
        });
      }
    }

    this.renderMobilePresetDrawer();
    this.updateMobilePresetBadge();
  }

  private startLiveLoop(): void {
    this.stopFrameLoop();
    const generation = this.loopGeneration;

    const onFrame = () => {
      if (generation !== this.loopGeneration || !this.cameraManager.isActive()) return;
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

      this.scheduleFrame(video, onFrame);
    };

    const video = this.cameraManager.getVideoElement();
    this.scheduleFrame(video, onFrame);
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

    // Lockstep video frame capture for recording
    if (this.videoRecorder.getIsRecording()) {
      this.videoRecorder.captureFrame();
    }

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

  private async updateQrModal(): Promise<void> {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    const lanBox = document.getElementById('qr-lan-box');
    const urlDisplay = document.getElementById('qr-url-display');
    const hostInput = document.getElementById('input-custom-host') as HTMLInputElement | null;

    if (lanBox && isLocalhost) {
      lanBox.classList.remove('hidden');
      if (hostInput && !hostInput.value && this.customMobileHost) {
        hostInput.value = this.customMobileHost;
      }
    }

    let baseUrl: string;
    if (this.customMobileHost) {
      baseUrl = `https://${this.customMobileHost}${window.location.pathname}`;
    } else {
      baseUrl = (window.location.origin + window.location.pathname).replace(/^http:\/\//, 'https://');
    }

    const dataUrl = await this.presetManager.generatePresetQrCode(this.activePreset, baseUrl);
    this.qrImage.src = dataUrl;

    const fullUrl = baseUrl + this.presetManager.encodePresetToHash(this.activePreset);
    if (urlDisplay) {
      urlDisplay.textContent = fullUrl;
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
