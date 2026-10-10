// Preset Manager: LocalStorage, URL Hash encoding/decoding, and QR Code generation
import QRCode from 'qrcode';
import type { SonificationPreset } from '../types/index.ts';
import { FACTORY_PRESETS } from './factory-presets.ts';

const STORAGE_KEY = 'sonification_v2_presets';
const HIDDEN_PRESETS_KEY = 'sonification_v2_hidden_presets';
export const LEGACY_PRESETS_STORAGE_KEY = STORAGE_KEY;
export const DEFAULT_PRESETS = FACTORY_PRESETS;

export class PresetManager {
  private presets: SonificationPreset[] = [];
  private hiddenPresetIds: Set<string> = new Set();

  constructor() {
    this.loadHiddenPresets();
    this.loadPresets();
  }

  private loadHiddenPresets(): void {
    try {
      const stored = localStorage.getItem(HIDDEN_PRESETS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.hiddenPresetIds = new Set(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load hidden presets', e);
    }
  }

  private persistHiddenPresets(): void {
    try {
      localStorage.setItem(HIDDEN_PRESETS_KEY, JSON.stringify([...this.hiddenPresetIds]));
    } catch (e) {
      console.warn('Failed to save hidden presets', e);
    }
  }

  private loadPresets(): void {
    this.presets = DEFAULT_PRESETS
      .filter(preset => !this.hiddenPresetIds.has(preset.id))
      .map(preset => JSON.parse(JSON.stringify(preset)));
  }

  getAllPresets(): SonificationPreset[] {
    return this.presets;
  }

  getDefaultPresets(): SonificationPreset[] {
    return this.presets;
  }

  getPresetById(id: string): SonificationPreset | undefined {
    return this.presets.find((p) => p.id === id) || FACTORY_PRESETS.find((p) => p.id === id);
  }

  getLegacyUserPresets(): SonificationPreset[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const decoded: unknown = JSON.parse(saved);
      if (!Array.isArray(decoded)) return [];
      return decoded.filter((item): item is SonificationPreset =>
        !!item && typeof item === 'object' && !this.isFactoryPreset((item as SonificationPreset).id)
      );
    } catch (e) {
      console.warn('Could not read legacy browser presets', e);
      return [];
    }
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
    if (this.isFactoryPreset(id)) {
      this.hiddenPresetIds.add(id);
      this.persistHiddenPresets();
    }
    this.persistUserPresets();
    return true;
  }

  restoreFactoryPresets(): void {
    this.hiddenPresetIds.clear();
    this.persistHiddenPresets();
    this.loadPresets();
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
    // If preset matches a factory preset by ID, prefer the clean short hash
    const factory = FACTORY_PRESETS.find((fp) => fp.id === preset.id);
    if (factory && JSON.stringify(factory) === JSON.stringify(preset)) {
      return `#preset=${preset.id}`;
    }
    const jsonStr = JSON.stringify(preset);
    const b64 = btoa(encodeURIComponent(jsonStr));
    return `#p=${b64}`;
  }

  // Decode preset from URL hash string
  decodePresetFromHash(hashStr: string): SonificationPreset | null {
    if (hashStr.startsWith('#preset=')) {
      const id = hashStr.slice(8);
      const fp = this.getPresetById(id);
      if (fp) return JSON.parse(JSON.stringify(fp));
    }
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
    let base = baseUrl || (window.location.origin + window.location.pathname);
    // Always enforce https:// protocol so mobile cameras and WebRTC APIs work out of the box
    if (base.startsWith('http://')) {
      base = base.replace(/^http:\/\//, 'https://');
    }
    return this.generateQrCodeForUrl(base + hash);
  }

  async generateQrCodeForUrl(url: string): Promise<string> {
    return await QRCode.toDataURL(url, {
      width: 360,
      margin: 4,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'L',
    });
  }
}
