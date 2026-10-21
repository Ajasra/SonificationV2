// QR Code Share and Mobile Device Link Modal Controller
import type { PresetManager } from '../presets/preset-manager.ts';
import type { SonopticonPreset } from '../types/index.ts';

export interface QrModalOptions {
  presetManager: PresetManager;
  getActivePreset: () => SonopticonPreset;
  getCustomHost: () => string;
  setCustomHost: (host: string) => void;
  getShareBaseUrl: () => string;
  isSavedByCurrentUser: () => boolean;
  onPublishClick: () => void;
  onShowNotice: (msg: string, error?: boolean) => void;
}

export class QrModalController {
  private modal = document.getElementById('qr-modal') as HTMLDivElement;
  private qrImage = document.getElementById('qr-image') as HTMLImageElement;
  private urlDisplay = document.getElementById('qr-url-display') as HTMLElement | null;
  private qrStatus = document.getElementById('qr-status') as HTMLElement | null;
  private lanBox = document.getElementById('qr-lan-box') as HTMLElement | null;
  private hostInput = document.getElementById('input-custom-host') as HTMLInputElement | null;
  private btnApplyHost = document.getElementById('btn-apply-host') as HTMLButtonElement | null;
  private btnCopyLink = document.getElementById('btn-copy-link') as HTMLButtonElement | null;
  private btnSharePublic = document.getElementById('btn-share-public') as HTMLButtonElement | null;
  private btnClose = document.getElementById('btn-close-qr') as HTMLButtonElement | null;

  constructor(private opts: QrModalOptions) {
    this.bindEvents();
  }

  private bindEvents(): void {
    if (this.btnClose) {
      this.btnClose.onclick = () => this.hide();
    }

    if (this.btnApplyHost && this.hostInput) {
      const applyHostFn = async () => {
        const val = this.hostInput?.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || '';
        if (val) {
          this.opts.setCustomHost(val);
          await this.updateModalContent();
        }
      };
      this.btnApplyHost.onclick = applyHostFn;
      this.hostInput.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await applyHostFn();
        }
      };
    }

    if (this.btnCopyLink) {
      this.btnCopyLink.onclick = () => {
        try {
          const baseUrl = this.opts.getShareBaseUrl();
          const hash = this.opts.presetManager.encodePresetToHash(this.opts.getActivePreset());
          void navigator.clipboard.writeText(baseUrl + hash).then(() => {
            if (this.qrStatus) this.qrStatus.textContent = 'Preset link copied.';
          }).catch(() => alert('Could not copy the link. Select and copy the URL shown above.'));
        } catch (error) {
          this.opts.onShowNotice((error as Error).message, true);
        }
      };
    }

    if (this.btnSharePublic) {
      this.btnSharePublic.onclick = () => {
        this.opts.onPublishClick();
      };
    }
  }

  public show(): void {
    this.modal.classList.remove('hidden');
  }

  public hide(): void {
    this.modal.classList.add('hidden');
  }

  public async openWithCurrentPreset(): Promise<void> {
    try {
      await this.updateModalContent();
      this.show();
    } catch (error) {
      this.opts.onShowNotice((error as Error).message, true);
    }
  }

  public async updateModalContent(): Promise<void> {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (this.lanBox && isLocalhost) {
      this.lanBox.classList.remove('hidden');
      if (this.hostInput && !this.hostInput.value && this.opts.getCustomHost()) {
        this.hostInput.value = this.opts.getCustomHost();
      }
    }

    const baseUrl = this.opts.getShareBaseUrl();
    const activePreset = this.opts.getActivePreset();

    const dataUrl = await this.opts.presetManager.generatePresetQrCode(activePreset, baseUrl);
    this.qrImage.src = dataUrl;

    const fullUrl = baseUrl + this.opts.presetManager.encodePresetToHash(activePreset);
    if (this.urlDisplay) {
      this.urlDisplay.textContent = fullUrl;
    }
    if (this.qrStatus) {
      this.qrStatus.textContent = '';
    }

    if (this.btnSharePublic) {
      this.btnSharePublic.textContent = this.opts.isSavedByCurrentUser()
        ? 'Publish this saved preset'
        : 'Save and publish this preset';
    }
  }

  public async showQrForHash(hash: string): Promise<void> {
    const base = this.opts.getShareBaseUrl();
    const fullUrl = base + hash;
    if (this.urlDisplay) this.urlDisplay.textContent = fullUrl;
    if (this.qrStatus) this.qrStatus.textContent = '';
    try {
      this.qrImage.src = await this.opts.presetManager.generateQrCodeForUrl(fullUrl);
    } catch {
      this.qrImage.removeAttribute('src');
      if (this.qrStatus) {
        this.qrStatus.textContent = 'This link is too large for a QR code. Copy the text link instead.';
      }
    }
    this.show();
  }
}
