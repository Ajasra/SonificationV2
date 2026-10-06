// Preset Manager: LocalStorage, URL Hash encoding/decoding, and QR Code generation
import QRCode from 'qrcode';
import type { SonificationPreset } from '../types/index.ts';
import { FACTORY_PRESETS } from './factory-presets.ts';

const STORAGE_KEY = 'sonification_v2_presets';

export class PresetManager {
  private presets: SonificationPreset[] = [];

  constructor() {
    this.loadPresets();
  }

  private loadPresets(): void {
    this.presets = [...FACTORY_PRESETS];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const userPresets = JSON.parse(saved) as SonificationPreset[];
        for (const p of userPresets) {
          if (!this.presets.some((ep) => ep.id === p.id)) {
            this.presets.push(p);
          }
        }
      }
    } catch (e) {
      console.warn('Could not load user presets from localStorage', e);
    }
  }

  getAllPresets(): SonificationPreset[] {
    return this.presets;
  }

  getPresetById(id: string): SonificationPreset | undefined {
    return this.presets.find((p) => p.id === id);
  }

  savePreset(preset: SonificationPreset): void {
    const existingIdx = this.presets.findIndex((p) => p.id === preset.id);
    if (existingIdx >= 0) {
      this.presets[existingIdx] = preset;
    } else {
      this.presets.push(preset);
    }
    this.persistUserPresets();
  }

  deletePreset(id: string): boolean {
    const idx = this.presets.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    // Remove from in-memory array
    this.presets.splice(idx, 1);
    this.persistUserPresets();
    return true;
  }

  isFactoryPreset(id: string): boolean {
    return FACTORY_PRESETS.some((fp) => fp.id === id);
  }

  private persistUserPresets(): void {
    try {
      const userOnly = this.presets.filter(
        (p) => !FACTORY_PRESETS.some((fp) => fp.id === p.id)
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userOnly));
    } catch (e) {
      console.warn('Failed to save presets to localStorage', e);
    }
  }

  // Compress preset into compact URL hash string
  encodePresetToHash(preset: SonificationPreset): string {
    const jsonStr = JSON.stringify(preset);
    const b64 = btoa(encodeURIComponent(jsonStr));
    return `#p=${b64}`;
  }

  // Decode preset from URL hash string
  decodePresetFromHash(hashStr: string): SonificationPreset | null {
    if (!hashStr.startsWith('#p=')) return null;
    try {
      const b64 = hashStr.slice(3);
      const jsonStr = decodeURIComponent(atob(b64));
      return JSON.parse(jsonStr) as SonificationPreset;
    } catch (e) {
      console.error('Invalid preset URL hash', e);
      return null;
    }
  }

  // Generate QR Code data URL for instant mobile scan
  async generatePresetQrCode(preset: SonificationPreset, baseUrl?: string): Promise<string> {
    const hash = this.encodePresetToHash(preset);
    const url = (baseUrl || window.location.origin + window.location.pathname) + hash;
    return await QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      color: {
        dark: '#00f0ff',
        light: '#0a0d14',
      },
      errorCorrectionLevel: 'M',
    });
  }
}
