import PocketBase, { type RecordModel } from 'pocketbase';
import type { SonificationPreset } from '../types/index.ts';
import { validatePreset } from '../presets/validate-preset.ts';

export interface StoredPreset extends RecordModel {
  owner: string;
  name: string;
  description: string;
  payload?: unknown;
  visibility: 'private' | 'public';
  authorName: string;
  isDefault?: boolean;
}

const API_URL = import.meta.env.VITE_POCKETBASE_URL || (typeof window !== 'undefined' && window.location ? window.location.origin : '');

export class AccountManager {
  readonly client = new PocketBase(API_URL);
  private refreshPromise: Promise<void> | null = null;
  private lastRefreshAt = 0;
  private languageSaveQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.client.autoCancellation(false);
  }

  get user(): RecordModel | null {
    return this.client.authStore.isValid ? this.client.authStore.record : null;
  }

  get userId(): string | null {
    return this.user?.id || null;
  }

  onChange(callback: () => void): () => void {
    return this.client.authStore.onChange(callback);
  }

  async restore(): Promise<void> {
    if (!this.client.authStore.token) return;
    try {
      await this.client.collection('users').authRefresh();
      this.lastRefreshAt = Date.now();
    } catch (error) {
      if ([401, 403].includes((error as { status?: number }).status || 0)) {
        this.client.authStore.clear();
        return;
      }
      throw error;
    }
  }

  async register(username: string, password: string): Promise<void> {
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(normalized)) throw new Error('Use 3–32 letters, numbers, or underscores for the username.');
    if (password.length < 8 || password.length > 128) throw new Error('Password must be between 8 and 128 characters.');
    await this.client.collection('users').create({ username: normalized, password, passwordConfirm: password, email: '', emailVisibility: false });
    await this.login(normalized, password);
  }

  async login(username: string, password: string): Promise<void> {
    await this.client.collection('users').authWithPassword(username.trim().toLowerCase(), password);
  }

  logout(): void {
    this.client.authStore.clear();
  }

  async saveLanguage(language: 'en' | 'zh-CN'): Promise<void> {
    const userId = this.userId;
    if (!userId) return;
    this.languageSaveQueue = this.languageSaveQueue.catch(() => undefined).then(async () => {
      if (this.userId !== userId) return;
      const token = this.client.authStore.token;
      const updated = await this.client.collection('users').update(userId, { language });
      if (this.userId === userId && this.client.authStore.token === token) {
        this.client.authStore.save(token, updated);
      }
    });
    await this.languageSaveQueue;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.client.authStore.isValid) throw new Error('Log in to access your presets.');
    if (Date.now() - this.lastRefreshAt >= 24 * 60 * 60 * 1000 && !this.refreshPromise) {
      this.refreshPromise = this.client.collection('users').authRefresh().then(() => {
        this.lastRefreshAt = Date.now();
      }).finally(() => { this.refreshPromise = null; });
    }
    if (this.refreshPromise) await this.refreshPromise;
  }

  async listMine(page: number, query: string): Promise<{ items: StoredPreset[]; totalPages: number }> {
    await this.ensureAuth();
    const owner = this.userId;
    if (!owner) throw new Error('Log in to access your presets.');
    const q = query.trim().slice(0, 128);
    const filter = q
      ? this.client.filter('owner = {:owner} && (name ~ {:query} || description ~ {:query})', { owner, query: q })
      : this.client.filter('owner = {:owner}', { owner });
    const result = await this.client.collection('presets').getList<StoredPreset>(page, 24, { filter, sort: '-updated', fields: 'id,owner,name,description,visibility,authorName,created,updated,isDefault' });
    return { items: result.items, totalPages: result.totalPages };
  }

  async searchPublic(page: number, query: string): Promise<{ items: StoredPreset[]; totalPages: number }> {
    const q = query.trim().slice(0, 128);
    const filter = q
      ? this.client.filter('visibility = "public" && (name ~ {:query} || description ~ {:query} || authorName ~ {:query})', { query: q })
      : 'visibility = "public"';
    const result = await this.client.collection('presets').getList<StoredPreset>(page, 24, { filter, sort: '-updated', fields: 'id,name,description,authorName,updated,isDefault' });
    return { items: result.items, totalPages: result.totalPages };
  }

  async getPublic(id: string): Promise<SonificationPreset> {
    const record = await this.client.collection('presets').getOne<StoredPreset>(id, { fields: 'id,name,description,payload,visibility' });
    if (record.visibility !== 'public' || !record.payload) throw new Error('This shared preset is no longer public.');
    return validatePreset(record.payload);
  }

  async getOwned(id: string): Promise<SonificationPreset> {
    await this.ensureAuth();
    const record = await this.client.collection('presets').getOne<StoredPreset>(id, { fields: 'id,owner,name,description,payload,visibility' });
    if (record.owner !== this.userId || !record.payload) throw new Error('This preset is not in your library.');
    return validatePreset(record.payload);
  }

  async save(preset: SonificationPreset): Promise<StoredPreset> {
    await this.ensureAuth();
    const valid = validatePreset(preset);
    return this.client.collection('presets').create<StoredPreset>({ owner: this.userId, name: valid.name, description: valid.description || '', payload: valid, schemaVersion: 1, visibility: 'private', authorName: this.user?.username || '' });
  }

  async update(id: string, preset: SonificationPreset): Promise<StoredPreset> {
    await this.ensureAuth();
    const valid = validatePreset(preset);
    return this.client.collection('presets').update<StoredPreset>(id, { name: valid.name, description: valid.description || '', payload: valid });
  }

  async remove(id: string): Promise<void> {
    await this.ensureAuth();
    await this.client.collection('presets').delete(id);
  }

  async setVisibility(id: string, visibility: 'private' | 'public'): Promise<StoredPreset> {
    await this.ensureAuth();
    return this.client.collection('presets').update<StoredPreset>(id, { visibility });
  }
}
