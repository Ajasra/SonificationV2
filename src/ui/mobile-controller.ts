// Mobile Viewport, Touch Drawer & Mobile Action Bar Controller
import type { SoundCameraAudio } from '../audio/sound-camera.ts';
import type { PresetManager } from '../presets/preset-manager.ts';
import type { SonificationPreset } from '../types/index.ts';
import { createResolutionSlider } from './resolution-slider.ts';

export interface MobileControllerOptions {
  audioEngine: SoundCameraAudio;
  presetManager: PresetManager;
  getActivePreset: () => SonificationPreset;
  setActivePreset: (preset: SonificationPreset) => void;
  onPresetChanged: () => void;
  onToggleCamera: () => Promise<void>;
  onStartCamera: () => Promise<boolean>;
  onFlipCamera: () => Promise<void>;
  onTriggerShutter: () => void;
  onToggleRecording: () => void;
  onSetResolution: (res: '360p' | '480p' | '720p' | 'native') => void;
  onVolumeChange: (vol: number) => void;
  onModeChanged?: (mode: 'cam' | 'scope' | 'rack') => void;
}

export class MobileController {
  private isFullscreenMode = false;
  private currentMode: 'cam' | 'scope' | 'rack' = 'cam';

  constructor(private opts: MobileControllerOptions) {
    this.init();
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  }

  public isMobileDevice(): boolean {
    return (
      window.innerWidth <= 900 ||
      /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );
  }

  public setFullscreenMode(enabled: boolean, requestBrowserFs = false): void {
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

  public getIsFullscreen(): boolean {
    return this.isFullscreenMode;
  }

  public getMode(): 'cam' | 'scope' | 'rack' {
    return this.currentMode;
  }

  public setMode(mode: 'cam' | 'scope' | 'rack'): void {
    this.currentMode = mode;
    const appEl = document.getElementById('app');
    const hudBay = document.getElementById('telemetry-hud-bay');
    const bottomBar = document.getElementById('mobile-bottom-bar');
    const modeLabel = document.getElementById('mobile-mode-label');

    if (modeLabel) {
      modeLabel.textContent = `[ ${mode.toUpperCase()} ▾ ]`;
    }

    // Update active class on mode buttons
    document.querySelectorAll('.btn-mode-seg').forEach((btn) => {
      const segMode = btn.getAttribute('data-mode');
      btn.classList.toggle('active', segMode === mode);
    });

    // Close mode menu dropdown if open
    document.getElementById('mobile-mode-bar')?.classList.remove('open');

    if (mode === 'cam') {
      appEl?.classList.remove('mobile-scope-mode', 'show-desktop-rack');
      hudBay?.classList.remove('mobile-active-scope');
      bottomBar?.classList.remove('hidden');
    } else if (mode === 'scope') {
      appEl?.classList.add('mobile-scope-mode');
      appEl?.classList.remove('show-desktop-rack');
      hudBay?.classList.add('mobile-active-scope');
      hudBay?.classList.remove('is-hidden');
      bottomBar?.classList.add('hidden');
    } else if (mode === 'rack') {
      appEl?.classList.remove('mobile-scope-mode');
      appEl?.classList.add('show-desktop-rack');
      hudBay?.classList.remove('mobile-active-scope');
      bottomBar?.classList.add('hidden');
    }

    this.opts.onModeChanged?.(mode);
  }

  public openDrawer(): void {
    this.renderPresetDrawer();
    document.getElementById('mobile-preset-drawer')?.classList.add('open');
    document.getElementById('mobile-drawer-backdrop')?.classList.remove('hidden');
    document.getElementById('mobile-drawer-backdrop')?.classList.add('open');
  }

  public closeDrawer(): void {
    document.getElementById('mobile-preset-drawer')?.classList.remove('open');
    document.getElementById('mobile-drawer-backdrop')?.classList.remove('open');
    setTimeout(() => {
      document.getElementById('mobile-drawer-backdrop')?.classList.add('hidden');
    }, 250);
  }

  public renderPresetDrawer(): void {
    const list = document.getElementById('mobile-preset-list');
    if (!list) return;
    list.innerHTML = '';
    const presets = this.opts.presetManager.getAllPresets();
    const active = this.opts.getActivePreset();

    for (const p of presets) {
      const item = document.createElement('div');
      const isActive = p.id === active.id;
      item.className = `mobile-preset-item ${isActive ? 'active' : ''}`;
      item.innerHTML = `
        <div class="mobile-preset-item-header">
          <span class="mobile-preset-item-name">${this.escapeHtml(p.name)}</span>
          ${isActive ? '<span class="mobile-preset-check">✓</span>' : ''}
        </div>
        ${p.description ? `<p class="mobile-preset-item-desc">${this.escapeHtml(p.description)}</p>` : ''}
      `;
      item.onclick = () => {
        this.opts.setActivePreset(JSON.parse(JSON.stringify(p)));
        this.opts.onPresetChanged();
        this.updatePresetBadge();
        this.closeDrawer();
      };
      list.appendChild(item);
    }
    this.updatePresetBadge();
  }

  public updatePresetBadge(): void {
    const nameEl = document.getElementById('mobile-preset-name');
    if (nameEl) {
      nameEl.textContent = this.opts.getActivePreset().name;
    }
  }

  public updateCamToggleUI(isActive: boolean): void {
    const startOverlay = document.getElementById('mobile-start-overlay');
    if (isActive) {
      startOverlay?.classList.add('hidden');
    } else if (this.isMobileDevice()) {
      startOverlay?.classList.remove('hidden');
    }
  }

  private init(): void {
    const isMobile = this.isMobileDevice();

    if (isMobile) {
      this.setFullscreenMode(true, false);
      this.setMode('cam');
      this.opts.onStartCamera().catch(() => {});
    }

    document.getElementById('btn-mobile-burger')?.addEventListener('click', () => {
      this.openDrawer();
    });

    document.getElementById('btn-mobile-preset-pill')?.addEventListener('click', () => {
      this.openDrawer();
    });

    document.getElementById('btn-drawer-camera')?.addEventListener('click', async () => {
      if (window.location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        window.location.href = window.location.href.replace('http:', 'https:');
        return;
      }
      await this.opts.onStartCamera();
      this.closeDrawer();
    });

    document.getElementById('btn-close-mobile-drawer')?.addEventListener('click', () => {
      this.closeDrawer();
    });
    document.getElementById('mobile-drawer-backdrop')?.addEventListener('click', () => {
      this.closeDrawer();
    });

    document.getElementById('btn-mobile-shutter')?.addEventListener('click', () => {
      this.opts.onTriggerShutter();
    });

    document.getElementById('btn-mobile-rec')?.addEventListener('click', () => {
      this.opts.onToggleRecording();
    });

    document.getElementById('btn-mobile-flip')?.addEventListener('click', async () => {
      await this.opts.onFlipCamera();
    });

    const btnMobileAudio = document.getElementById('btn-mobile-audio');
    const iconOn = document.getElementById('mobile-audio-icon-on');
    const iconOff = document.getElementById('mobile-audio-icon-off');
    const updateAudioMobileUI = () => {
      const muted = this.opts.audioEngine.getMuted();
      if (muted) {
        iconOn?.classList.add('hidden');
        iconOff?.classList.remove('hidden');
        btnMobileAudio?.classList.remove('active');
      } else {
        iconOff?.classList.add('hidden');
        iconOn?.classList.remove('hidden');
        btnMobileAudio?.classList.add('active');
      }
    };

    btnMobileAudio?.addEventListener('click', () => {
      this.opts.audioEngine.init();
      const isMuted = !this.opts.audioEngine.getMuted();
      this.opts.audioEngine.setMuted(isMuted);
      updateAudioMobileUI();
    });

    const mobileVol = document.getElementById('mobile-slider-volume') as HTMLInputElement | null;
    if (mobileVol) {
      mobileVol.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        this.opts.audioEngine.setVolume(val);
        this.opts.onVolumeChange(val);
      });
    }

    createResolutionSlider(
      document.getElementById('mobile-slider-resolution-mount'),
      (res) => this.opts.onSetResolution(res),
    );

    const modeMenuBtn = document.getElementById('btn-mobile-mode-menu');
    const modeBar = document.getElementById('mobile-mode-bar');
    modeMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      modeBar?.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (modeBar?.classList.contains('open') && !modeBar.contains(e.target as Node) && !modeMenuBtn?.contains(e.target as Node)) {
        modeBar.classList.remove('open');
      }
    });

    document.getElementById('btn-mode-cam')?.addEventListener('click', () => {
      this.setMode('cam');
    });

    document.getElementById('btn-mode-scope')?.addEventListener('click', () => {
      this.setMode('scope');
    });

    document.getElementById('btn-mode-rack')?.addEventListener('click', () => {
      this.setMode('rack');
    });

    document.getElementById('btn-mobile-desktop-toggle')?.addEventListener('click', () => {
      const isShowing = document.getElementById('app')?.classList.contains('show-desktop-rack');
      this.setMode(isShowing ? 'cam' : 'rack');
      this.closeDrawer();
    });

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
        this.opts.audioEngine.init();
        this.opts.audioEngine.setMuted(false);
        updateAudioMobileUI();
        await this.opts.onStartCamera();
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

    this.renderPresetDrawer();
    this.updatePresetBadge();
  }
}
