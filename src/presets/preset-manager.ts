// Preset Manager: LocalStorage, URL Hash encoding/decoding, and QR Code generation
import QRCode from 'qrcode';
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import type { SonopticonPreset } from '../types/index.ts';
import { FACTORY_PRESETS } from './factory-presets.ts';

const STORAGE_KEY = 'sonopticon_presets';
const HIDDEN_PRESETS_KEY = 'sonopticon_hidden_presets';
export const LEGACY_PRESETS_STORAGE_KEY = 'sonification_v2_presets';
export const DEFAULT_PRESETS = FACTORY_PRESETS;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function compactPreset(p: SonopticonPreset): unknown[] {
  return [
    p.id,
    p.name,
    p.description || '',
    [
      p.reader.rawType,
      p.reader.law,
      p.reader.sign,
      p.reader.bits,
      p.reader.endianess,
      p.reader.colorSpace,
    ],
    [
      p.writer.rawType,
      p.writer.law,
      p.writer.sign,
      p.writer.bits,
      p.writer.endianess,
      p.writer.colorSpace,
    ],
    p.equalize ? 1 : 0,
    p.blendMode,
    p.blendAmount,
    p.filters.map((f) => [
      f.id,
      f.type,
      f.enabled ? 1 : 0,
      f.sampleRate,
      f.params,
    ]),
    (p.videoFilters || []).map((f) => [f.id, f.type, f.enabled ? 1 : 0, f.params]),
    (p.chain || []).map((c) => [c.kind === 'video' ? 1 : 0, c.id]),
  ];
}

function uncompactPreset(arr: unknown): SonopticonPreset | null {
  if (!Array.isArray(arr) || (arr.length !== 9 && arr.length !== 11)) return null;
  const readerArr = arr[3];
  const writerArr = arr[4];
  const filtersArr = arr[8];
  if (!Array.isArray(readerArr) || !Array.isArray(writerArr) || !Array.isArray(filtersArr)) return null;
  const videoArr = Array.isArray(arr[9]) ? (arr[9] as unknown[][]) : [];
  const chainArr = Array.isArray(arr[10]) ? (arr[10] as unknown[][]) : null;

  return {
    id: String(arr[0]),
    name: String(arr[1]),
    description: typeof arr[2] === 'string' ? arr[2] : '',
    reader: {
      rawType: readerArr[0],
      law: readerArr[1],
      sign: readerArr[2],
      bits: readerArr[3],
      endianess: readerArr[4],
      colorSpace: readerArr[5],
    },
    writer: {
      rawType: writerArr[0],
      law: writerArr[1],
      sign: writerArr[2],
      bits: writerArr[3],
      endianess: writerArr[4],
      colorSpace: writerArr[5],
    },
    equalize: Boolean(arr[5]),
    blendMode: arr[6],
    blendAmount: Number(arr[7]),
    filters: filtersArr.map((f: unknown[]) => ({
      id: String(f[0]),
      type: f[1] as any,
      enabled: Boolean(f[2]),
      sampleRate: Number(f[3]),
      params: (f[4] as Record<string, number>) || {},
    })),
    videoFilters: videoArr.map((f) => ({
      id: String(f[0]),
      type: f[1] as any,
      enabled: Boolean(f[2]),
      params: (f[3] as Record<string, number>) || {},
    })),
    ...(chainArr && chainArr.length > 0
      ? { chain: chainArr.map((c) => ({ kind: c[0] ? ('video' as const) : ('audio' as const), id: String(c[1]) })) }
      : {}),
  };
}

export class PresetManager {
  private presets: SonopticonPreset[] = [];
  private hiddenPresetIds: Set<string> = new Set();

  constructor() {
    this.loadHiddenPresets();
    this.loadPresets();
  }

  private loadHiddenPresets(): void {
    try {
      const stored = localStorage.getItem(HIDDEN_PRESETS_KEY) ?? localStorage.getItem('sonification_v2_hidden_presets');
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

  getAllPresets(): SonopticonPreset[] {
    return this.presets;
  }

  getDefaultPresets(): SonopticonPreset[] {
    return this.presets;
  }

  getPresetById(id: string): SonopticonPreset | undefined {
    return this.presets.find((p) => p.id === id) || FACTORY_PRESETS.find((p) => p.id === id);
  }

  getLegacyUserPresets(): SonopticonPreset[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_PRESETS_STORAGE_KEY);
      if (!saved) return [];
      const decoded: unknown = JSON.parse(saved);
      if (!Array.isArray(decoded)) return [];
      return decoded.filter((item): item is SonopticonPreset =>
        !!item && typeof item === 'object' && !this.isFactoryPreset((item as SonopticonPreset).id)
      );
    } catch (e) {
      console.warn('Could not read legacy browser presets', e);
      return [];
    }
  }

  savePreset(preset: SonopticonPreset): void {
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
  encodePresetToHash(preset: SonopticonPreset): string {
    // If preset matches a factory preset by ID, prefer the clean short hash
    const factory = FACTORY_PRESETS.find((fp) => fp.id === preset.id);
    if (factory && JSON.stringify(factory) === JSON.stringify(preset)) {
      return `#preset=${preset.id}`;
    }

    try {
      const compacted = compactPreset(preset);
      const jsonStr = JSON.stringify(compacted);
      const deflated = deflateSync(strToU8(jsonStr));
      return `#z=${toBase64Url(deflated)}`;
    } catch (e) {
      console.warn('Failed to deflate preset, falling back to base64 JSON', e);
      const jsonStr = JSON.stringify(preset);
      const b64 = btoa(encodeURIComponent(jsonStr));
      return `#p=${b64}`;
    }
  }

  // Decode preset from URL hash string
  decodePresetFromHash(hashStr: string): SonopticonPreset | null {
    const cleanHash = hashStr.startsWith('#') ? hashStr.slice(1) : hashStr;

    if (cleanHash.startsWith('preset=')) {
      const id = cleanHash.slice(7);
      const fp = this.getPresetById(id);
      if (fp) return JSON.parse(JSON.stringify(fp));
    }

    if (cleanHash.startsWith('z=')) {
      try {
        const b64url = cleanHash.slice(2);
        const bytes = fromBase64Url(b64url);
        const inflated = inflateSync(bytes);
        const jsonStr = strFromU8(inflated);
        const parsed = JSON.parse(jsonStr);
        const restored = uncompactPreset(parsed);
        if (restored) return restored;
      } catch (e) {
        console.error('Invalid compressed preset URL hash', e);
        return null;
      }
    }

    if (cleanHash.startsWith('p=')) {
      try {
        const b64 = cleanHash.slice(2);
        let jsonStr: string;
        try {
          jsonStr = decodeURIComponent(atob(b64));
        } catch {
          jsonStr = atob(b64);
        }
        return JSON.parse(jsonStr) as SonopticonPreset;
      } catch (e) {
        console.error('Invalid preset URL hash', e);
        return null;
      }
    }

    return null;
  }

  // Generate QR Code data URL for instant mobile scan
  async generatePresetQrCode(preset: SonopticonPreset, baseUrl?: string): Promise<string> {
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
      width: 480,
      margin: 4,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
  }
}
