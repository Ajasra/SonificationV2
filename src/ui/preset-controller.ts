// Preset Bar, Exploration Library & Hardware Seed / Bus Telemetry Controller
import type { PresetManager } from '../presets/preset-manager.ts';
import type { AccountManager, StoredPreset } from '../account/account-manager.ts';
import type { SonificationPreset } from '../types/index.ts';
import { validatePreset } from '../presets/validate-preset.ts';
import { FILTER_DESCRIPTORS } from '../engine/filters/factory.ts';

export interface PresetControllerOptions {
  presetManager: PresetManager;
  accountManager: AccountManager;
  getActivePreset: () => SonificationPreset;
  setActivePreset: (preset: SonificationPreset, saved?: StoredPreset) => void;
  onPresetChanged: () => void;
  onOpenAccountModal: (mode?: 'login' | 'register') => void;
  onShowQrForHash: (hash: string) => Promise<void>;
  onShowNotice: (msg: string, error?: boolean) => void;
  onRequestRender: () => void;
  onBusRateChanged: (rate: number) => void;
}

export class PresetController {
  private selectPreset = document.getElementById('select-preset') as HTMLSelectElement;
  private inputPresetDesc = document.getElementById('input-preset-desc') as HTMLTextAreaElement;
  private btnPresetSave = document.getElementById('btn-preset-save') as HTMLButtonElement;
  private btnPresetUpdate = document.getElementById('btn-preset-update') as HTMLButtonElement;
  private btnPresetDelete = document.getElementById('btn-preset-delete') as HTMLButtonElement;

  private fieldNoteTitle = document.getElementById('field-note-title');
  private fieldNoteDesc = document.getElementById('field-note-desc');
  private studyNumber = document.getElementById('study-number');
  private patchSeed = document.getElementById('patch-seed');
  private busRate = document.getElementById('bus-rate');
  private statusSeedCode = document.getElementById('status-seed-code');

  private currentSeed = 4821;
  public static readonly BUS_RATES: { label: string; rate: number }[] = [
    { label: '8.0 kHz', rate: 8000 },
    { label: '11.0 kHz', rate: 11025 },
    { label: '22.05 kHz', rate: 22050 },
    { label: '32.0 kHz', rate: 32000 },
    { label: '44.1 kHz', rate: 44100 },
    { label: '48.0 kHz', rate: 48000 },
    { label: '96.0 kHz', rate: 96000 },
  ];
  private currentBusIndex = 4; // default: 44.1 kHz

  private savedPresetId: string | null = null;
  private savedPresetOwnerId: string | null = null;

  // Preset library modal state
  private libraryMode: 'mine' | 'explore' = 'mine';
  private presetSubFilter: 'all' | 'mine' | 'defaults' = 'all';
  private libraryPage = 1;
  private libraryTotalPages = 1;
  private libraryQuery = '';
  private libraryRequest = 0;
  private librarySearchTimer: number | null = null;

  constructor(private opts: PresetControllerOptions) {
    this.initPresetSeed();
    this.bindEvents();
    this.renderPresetDropdown();
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private newId(): string {
    return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  public getSavedPresetId(): string | null {
    return this.savedPresetId;
  }

  public getSavedPresetOwnerId(): string | null {
    return this.savedPresetOwnerId;
  }

  public setSavedPresetMeta(id: string | null, owner: string | null): void {
    this.savedPresetId = id;
    this.savedPresetOwnerId = owner;
    this.updatePresetButtonsState();
  }

  public getCurrentBusRate(): number {
    return PresetController.BUS_RATES[this.currentBusIndex].rate;
  }

  public getCurrentSeed(): number {
    return this.currentSeed;
  }

  public initPresetSeed(): void {
    const active = this.opts.getActivePreset();
    this.currentSeed = Math.abs(this.hashCode(active.id)) % 9000 + 1000;
  }

  public updateEditorialHeaders(): void {
    const active = this.opts.getActivePreset();
    if (this.fieldNoteTitle) {
      const words = active.name.split(' ');
      if (words.length > 1) {
        const last = words.pop();
        this.fieldNoteTitle.innerHTML = `${this.escapeHtml(words.join(' '))} <em>${this.escapeHtml(last!)}</em>.`;
      } else {
        this.fieldNoteTitle.innerHTML = `Drawn by <em>${this.escapeHtml(active.name)}</em>.`;
      }
    }

    if (this.fieldNoteDesc && active.description) {
      this.fieldNoteDesc.textContent = active.description;
    }

    const allPresets = this.opts.presetManager.getAllPresets();
    const presetIdx = allPresets.findIndex((p) => p.id === active.id);
    if (this.studyNumber) {
      this.studyNumber.textContent = String(Math.max(1, presetIdx + 1)).padStart(2, '0');
    }

    if (this.patchSeed) this.patchSeed.textContent = String(this.currentSeed);
    if (this.statusSeedCode) this.statusSeedCode.textContent = String(this.currentSeed);

    if (this.busRate) {
      this.busRate.textContent = PresetController.BUS_RATES[this.currentBusIndex].label;
    }
  }

  public applySeed(newSeed: number): void {
    this.currentSeed = newSeed;
    let s = newSeed;
    const nextRandom = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    const active = this.opts.getActivePreset();
    for (const f of active.filters) {
      const desc = FILTER_DESCRIPTORS[f.type];
      if (!desc) continue;
      for (const p of desc.params) {
        const range = p.max - p.min;
        const jitter = (nextRandom() - 0.5) * 0.4 * range;
        const currentVal = f.params[p.name] !== undefined ? f.params[p.name] : p.value;
        const newVal = Math.min(p.max, Math.max(p.min, currentVal + jitter));
        f.params[p.name] = Number(newVal.toFixed(p.step < 0.01 ? 3 : 2));
      }
    }

    this.opts.onPresetChanged();
    this.opts.onRequestRender();

    if (this.patchSeed) {
      this.patchSeed.textContent = String(this.currentSeed);
      this.patchSeed.style.color = '#fff';
      setTimeout(() => {
        if (this.patchSeed) this.patchSeed.style.color = '';
      }, 300);
    }
  }

  public setBusRateIndex(idx: number): void {
    this.currentBusIndex = (idx + PresetController.BUS_RATES.length) % PresetController.BUS_RATES.length;
    const busConfig = PresetController.BUS_RATES[this.currentBusIndex];

    const active = this.opts.getActivePreset();
    for (const f of active.filters) {
      f.sampleRate = busConfig.rate;
    }

    if (this.busRate) {
      this.busRate.textContent = busConfig.label;
      this.busRate.style.color = '#fff';
      setTimeout(() => {
        if (this.busRate) this.busRate.style.color = '';
      }, 300);
    }

    this.opts.onBusRateChanged(busConfig.rate);
    this.opts.onRequestRender();
  }

  public updatePresetButtonsState(): void {
    const isSavedPreset = !!this.savedPresetId && this.savedPresetOwnerId === this.opts.accountManager.userId;
    const active = this.opts.getActivePreset();
    const isDefaultPreset = this.opts.presetManager.isFactoryPreset(active?.id);
    const canDelete = isSavedPreset || isDefaultPreset;
    if (this.btnPresetDelete) {
      this.btnPresetDelete.disabled = !canDelete;
      this.btnPresetDelete.title = isSavedPreset
        ? 'Delete this saved preset'
        : isDefaultPreset
          ? 'Remove this default preset from your preset list'
          : 'Save this preset to your account first';
    }
    if (this.btnPresetUpdate) this.btnPresetUpdate.textContent = isSavedPreset ? 'Update' : 'Save copy';
    if (this.btnPresetSave) this.btnPresetSave.textContent = isSavedPreset ? '+ Save Copy' : '+ Save New';
  }

  public renderPresetDropdown(): void {
    const active = this.opts.getActivePreset();
    if (this.selectPreset) {
      this.selectPreset.innerHTML = '';
      const presets = this.opts.presetManager.getDefaultPresets();
      for (let i = 0; i < presets.length; i++) {
        const p = presets[i];
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${String(i + 1).padStart(2, '0')} — ${p.name}`;
        opt.selected = p.id === active.id;
        this.selectPreset.appendChild(opt);
      }
      if (!presets.some(p => p.id === active.id)) {
        const customOpt = document.createElement('option');
        customOpt.value = active.id;
        customOpt.textContent = `★ — ${active.name}`;
        customOpt.selected = true;
        this.selectPreset.insertBefore(customOpt, this.selectPreset.firstChild);
      }
    }

    const nameEl = document.getElementById('preset-active-name');
    const badgeEl = document.getElementById('preset-active-badge');
    if (nameEl) {
      nameEl.textContent = active.name;
    }
    if (badgeEl) {
      const isUser = !!this.savedPresetId && this.savedPresetOwnerId === this.opts.accountManager.userId;
      const isFactory = this.opts.presetManager.isFactoryPreset(active.id);
      if (isUser) {
        badgeEl.textContent = 'MY PRESET';
        badgeEl.className = 'preset-badge is-user';
      } else if (isFactory) {
        badgeEl.textContent = 'FACTORY STUDY';
        badgeEl.className = 'preset-badge';
      } else {
        badgeEl.textContent = 'CUSTOM STUDY';
        badgeEl.className = 'preset-badge is-user';
      }
    }

    this.updatePresetButtonsState();
  }

  public async saveActivePreset(update: boolean): Promise<void> {
    if (!this.opts.accountManager.userId) {
      this.opts.onOpenAccountModal('login');
      const message = document.getElementById('account-message');
      if (message) message.textContent = 'Log in or create an account to save this preset.';
      return;
    }
    const canUpdate = update && this.savedPresetId && this.savedPresetOwnerId === this.opts.accountManager.userId;
    const active = this.opts.getActivePreset();
    const next = validatePreset(JSON.parse(JSON.stringify(active)));
    if (!canUpdate) {
      const defaultName = next.name.endsWith('(Copy)') ? next.name : `${next.name} (Copy)`;
      const name = prompt('Preset name:', defaultName);
      if (!name?.trim()) return;
      next.id = `user_${this.newId()}`;
      next.name = name.trim().slice(0, 128);
    }
    next.description = this.inputPresetDesc?.value.slice(0, 4096) || '';
    try {
      const record = canUpdate
        ? await this.opts.accountManager.update(this.savedPresetId!, next)
        : await this.opts.accountManager.save(next);
      this.opts.setActivePreset(next, record);
      this.opts.onShowNotice(canUpdate ? 'Preset updated.' : 'Preset saved privately to your account.');
    } catch (error) {
      this.opts.onOpenAccountModal();
      this.opts.onShowNotice(`Preset was not saved. Your current edits are still here: ${(error as Error).message}`, true);
    }
  }

  public async publishSavedPreset(): Promise<void> {
    if (!this.savedPresetId || this.savedPresetOwnerId !== this.opts.accountManager.userId) return;
    const id = this.savedPresetId;
    await this.opts.accountManager.setVisibility(id, 'public');
    await this.opts.onShowQrForHash(`#shared=${id}`);
    const status = document.getElementById('qr-status');
    if (status) status.textContent = 'Public preset link. Anyone with it can open this preset.';
  }

  private bindEvents(): void {
    if (this.selectPreset) {
      this.selectPreset.onchange = () => {
        const selectedId = this.selectPreset.value;
        const all = this.opts.presetManager.getAllPresets();
        const p = all.find(x => x.id === selectedId);
        if (p) {
          this.opts.setActivePreset(JSON.parse(JSON.stringify(p)));
          this.savedPresetId = null;
          this.savedPresetOwnerId = null;
          this.initPresetSeed();
          this.renderPresetDropdown();
          this.opts.onPresetChanged();
          this.opts.onRequestRender();
        }
      };
    }

    if (this.btnPresetSave) {
      this.btnPresetSave.onclick = () => { void this.saveActivePreset(false); };
    }
    if (this.btnPresetUpdate) {
      this.btnPresetUpdate.onclick = () => {
        const isSaved = !!this.savedPresetId && this.savedPresetOwnerId === this.opts.accountManager.userId;
        void this.saveActivePreset(isSaved);
      };
    }
    if (this.btnPresetDelete) {
      this.btnPresetDelete.onclick = async () => {
        const active = this.opts.getActivePreset();
        if (!confirm(`Delete preset “${active.name}”?`)) return;
        if (this.savedPresetId && this.savedPresetOwnerId === this.opts.accountManager.userId) {
          const id = this.savedPresetId;
          try {
            await this.opts.accountManager.remove(id);
            this.savedPresetId = null;
            this.savedPresetOwnerId = null;
            this.opts.onShowNotice('Saved preset deleted.');
          } catch (error) {
            this.opts.onShowNotice((error as Error).message, true);
          }
        }
        const defaults = this.opts.presetManager.getDefaultPresets();
        this.opts.setActivePreset(JSON.parse(JSON.stringify(defaults[0])));
        this.initPresetSeed();
        this.renderPresetDropdown();
        this.opts.onPresetChanged();
        this.opts.onRequestRender();
      };
    }

    const seedStep = document.getElementById('btn-seed-step');
    if (seedStep) {
      seedStep.onclick = () => {
        const nextSeed = (this.currentSeed + 137) % 9000 + 1000;
        this.applySeed(nextSeed);
      };
    }

    const busStep = document.getElementById('btn-bus-step');
    if (busStep) {
      busStep.onclick = () => {
        this.setBusRateIndex(this.currentBusIndex + 1);
      };
    }

    // Preset library triggers
    const openLibraryMine = () => this.openPresetLibrary('mine');
    const openLibraryExplore = () => this.openPresetLibrary('explore');
    document.getElementById('btn-presets')?.addEventListener('click', openLibraryMine);
    document.getElementById('btn-preset-library')?.addEventListener('click', openLibraryMine);
    document.getElementById('btn-explore-presets')?.addEventListener('click', openLibraryExplore);
    document.getElementById('btn-drawer-presets')?.addEventListener('click', openLibraryMine);
    document.getElementById('btn-drawer-my-presets')?.addEventListener('click', openLibraryMine);
    document.getElementById('btn-drawer-explore')?.addEventListener('click', openLibraryExplore);

    document.getElementById('btn-close-preset-library')?.addEventListener('click', () => {
      document.getElementById('preset-library-modal')?.classList.add('hidden');
    });

    const searchInput = document.getElementById('preset-library-search') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.oninput = () => {
        if (this.librarySearchTimer) clearTimeout(this.librarySearchTimer);
        this.librarySearchTimer = window.setTimeout(() => {
          this.libraryQuery = searchInput.value.trim();
          this.libraryPage = 1;
          void this.loadPresetLibrary();
        }, 300);
      };
    }

    const tabs = document.querySelectorAll('.preset-lib-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = (tab as HTMLElement).dataset.mode as 'mine' | 'explore';
        if (mode && mode !== this.libraryMode) {
          this.libraryMode = mode;
          this.libraryPage = 1;
          this.updatePresetLibraryTabUI();
          void this.loadPresetLibrary();
        }
      });
    });

    const subBtns = document.querySelectorAll('.preset-sub-btn');
    subBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = (btn as HTMLElement).dataset.sub as 'all' | 'mine' | 'defaults';
        if (sub && sub !== this.presetSubFilter) {
          this.presetSubFilter = sub;
          this.libraryPage = 1;
          this.updatePresetLibraryTabUI();
          void this.loadPresetLibrary();
        }
      });
    });

    document.getElementById('btn-library-previous')?.addEventListener('click', () => {
      if (this.libraryPage > 1) {
        this.libraryPage--;
        void this.loadPresetLibrary();
      }
    });

    document.getElementById('btn-library-next')?.addEventListener('click', () => {
      if (this.libraryPage < this.libraryTotalPages) {
        this.libraryPage++;
        void this.loadPresetLibrary();
      }
    });
  }

  public updatePresetLibraryTabUI(): void {
    const tabs = document.querySelectorAll('.preset-lib-tab');
    tabs.forEach(tab => {
      const mode = (tab as HTMLElement).dataset.mode;
      tab.classList.toggle('active', mode === this.libraryMode);
    });

    const subFilter = document.getElementById('preset-sub-filter');
    if (subFilter) {
      subFilter.classList.toggle('hidden', this.libraryMode !== 'mine');
      const subBtns = subFilter.querySelectorAll('.preset-sub-btn');
      subBtns.forEach(btn => {
        const sub = (btn as HTMLElement).dataset.sub;
        btn.classList.toggle('active', sub === this.presetSubFilter);
      });
    }

    const title = document.getElementById('preset-library-title');
    const sub = document.getElementById('preset-library-sub');
    if (this.libraryMode === 'mine') {
      if (title) title.textContent = 'Presets Library';
      if (sub) sub.textContent = 'Your saved studies and curated built-in defaults.';
    } else {
      if (title) title.textContent = 'Explore Shared Presets';
      if (sub) sub.textContent = 'Public community presets browsable without an account.';
    }
  }

  public openPresetLibrary(mode: 'mine' | 'explore' = 'mine'): void {
    this.libraryMode = mode;
    this.libraryPage = 1;
    this.libraryQuery = '';
    const search = document.getElementById('preset-library-search') as HTMLInputElement | null;
    if (search) search.value = '';
    const modal = document.getElementById('preset-library-modal');
    modal?.classList.remove('hidden');
    this.updatePresetLibraryTabUI();
    void this.loadPresetLibrary();
  }

  public async loadPresetLibrary(): Promise<void> {
    const request = ++this.libraryRequest;
    const list = document.getElementById('preset-library-list');
    const status = document.getElementById('preset-library-status');
    const pagination = document.getElementById('preset-library-pagination');
    if (!list || !status) return;
    list.replaceChildren();
    delete status.dataset.error;

    if (this.libraryMode === 'explore') {
      status.textContent = 'Loading presets…';
      if (pagination) pagination.classList.remove('hidden');
      try {
        const result = await this.opts.accountManager.searchPublic(this.libraryPage, this.libraryQuery);
        if (request !== this.libraryRequest || document.getElementById('preset-library-modal')?.classList.contains('hidden')) return;
        this.libraryTotalPages = Math.max(1, result.totalPages);
        status.textContent = result.items.length ? '' : 'No public presets found.';
        for (const preset of result.items) this.renderStoredPresetCard(preset, list);
      } catch (error) {
        if (request !== this.libraryRequest) return;
        status.textContent = `Could not load presets: ${(error as Error).message}`;
        status.dataset.error = 'true';
      }
    } else {
      const allDefaults = this.opts.presetManager.getDefaultPresets();
      const q = this.libraryQuery.toLowerCase().trim();
      const matchedDefaults = q
        ? allDefaults.filter(p => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)))
        : allDefaults;

      if (this.presetSubFilter === 'defaults') {
        if (pagination) pagination.classList.remove('hidden');
        this.libraryTotalPages = Math.max(1, Math.ceil(matchedDefaults.length / 24));
        const pageIndex = Math.max(1, Math.min(this.libraryPage, this.libraryTotalPages));
        const start = (pageIndex - 1) * 24;
        const pageItems = matchedDefaults.slice(start, start + 24);
        status.textContent = pageItems.length ? '' : 'No default presets found.';
        for (const preset of pageItems) this.renderDefaultPresetCard(preset, list);
      } else if (this.presetSubFilter === 'mine') {
        if (!this.opts.accountManager.userId) {
          if (pagination) pagination.classList.add('hidden');
          status.textContent = 'Sign in to access your personal preset library.';
          const loginCard = document.createElement('div');
          loginCard.style.gridColumn = '1 / -1';
          loginCard.style.textAlign = 'center';
          loginCard.style.padding = '20px';
          const loginBtn = document.createElement('button');
          loginBtn.className = 'btn-hw btn-hw-primary';
          loginBtn.textContent = 'Log in / Create Account';
          loginBtn.onclick = () => { this.opts.onOpenAccountModal('login'); };
          loginCard.appendChild(loginBtn);
          list.appendChild(loginCard);
        } else {
          status.textContent = 'Loading presets…';
          if (pagination) pagination.classList.remove('hidden');
          try {
            const result = await this.opts.accountManager.listMine(this.libraryPage, this.libraryQuery);
            if (request !== this.libraryRequest || document.getElementById('preset-library-modal')?.classList.contains('hidden')) return;
            this.libraryTotalPages = Math.max(1, result.totalPages);
            status.textContent = result.items.length ? '' : 'No saved presets found.';
            for (const preset of result.items) this.renderStoredPresetCard(preset, list);
          } catch (error) {
            if (request !== this.libraryRequest) return;
            status.textContent = `Could not load presets: ${(error as Error).message}`;
            status.dataset.error = 'true';
          }
        }
      } else {
        if (pagination) pagination.classList.add('hidden');
        if (this.opts.accountManager.userId) {
          try {
            const result = await this.opts.accountManager.listMine(1, this.libraryQuery);
            if (request !== this.libraryRequest || document.getElementById('preset-library-modal')?.classList.contains('hidden')) return;
            for (const preset of result.items) this.renderStoredPresetCard(preset, list);
          } catch (err) {
            console.warn('Could not fetch user presets in all view', err);
          }
        }
        for (const preset of matchedDefaults) this.renderDefaultPresetCard(preset, list);
        status.textContent = list.children.length ? '' : 'No presets found matching search.';
      }
    }

    const pageLabel = document.getElementById('preset-library-page');
    if (pageLabel) pageLabel.textContent = `${this.libraryPage} / ${this.libraryTotalPages}`;
    const prevBtn = document.getElementById('btn-library-previous') as HTMLButtonElement | null;
    const nextBtn = document.getElementById('btn-library-next') as HTMLButtonElement | null;
    if (prevBtn) prevBtn.disabled = this.libraryPage <= 1;
    if (nextBtn) nextBtn.disabled = this.libraryPage >= this.libraryTotalPages;
  }

  private renderDefaultPresetCard(preset: SonificationPreset, list: HTMLElement): void {
    const card = document.createElement('article');
    card.className = 'preset-library-card';
    const top = document.createElement('div');
    top.className = 'preset-card-header';
    const heading = document.createElement('h4');
    heading.textContent = preset.name;
    const badge = document.createElement('span');
    badge.className = 'preset-card-badge is-default';
    badge.textContent = 'DEFAULT';
    top.append(heading, badge);
    const description = document.createElement('p');
    description.textContent = preset.description || 'Curated factory preset.';
    const author = document.createElement('small');
    author.textContent = 'Factory Built-in';
    const actions = document.createElement('div');
    actions.className = 'preset-card-actions';
    const button = (label: string, callback: () => void | Promise<void>, style = 'btn-hw-secondary') => {
      const control = document.createElement('button');
      control.className = `btn-hw ${style} btn-sm`;
      control.textContent = label;
      control.onclick = () => { void callback(); };
      actions.appendChild(control);
    };
    button('Apply', () => {
      this.opts.setActivePreset(preset);
      document.getElementById('preset-library-modal')?.classList.add('hidden');
      this.opts.onShowNotice(`Factory preset "${preset.name}" applied.`);
    }, 'btn-hw-primary');
    if (this.opts.accountManager.userId) {
      button('Save copy', async () => {
        try {
          const copy = JSON.parse(JSON.stringify(preset)) as SonificationPreset;
          copy.id = `user_${this.newId()}`;
          const name = prompt('Name your copy:', `${copy.name} (Copy)`);
          if (!name?.trim()) return;
          copy.name = name.trim().slice(0, 128);
          const saved = await this.opts.accountManager.save(copy);
          this.opts.onShowNotice('Private copy saved to My presets.');
          this.opts.setActivePreset(copy, saved);
        } catch (error) { this.opts.onShowNotice((error as Error).message, true); }
      });
    }
    button('QR link', async () => {
      const hash = this.opts.presetManager.encodePresetToHash(preset);
      await this.opts.onShowQrForHash(hash);
      document.getElementById('preset-library-modal')?.classList.add('hidden');
    });
    card.append(top, description, author, actions);
    list.appendChild(card);
  }

  private renderStoredPresetCard(record: StoredPreset, list: HTMLElement): void {
    const card = document.createElement('article');
    card.className = 'preset-library-card';
    const top = document.createElement('div');
    top.className = 'preset-card-header';
    const heading = document.createElement('h4');
    heading.textContent = record.name;
    const badge = document.createElement('span');
    const isMine = this.libraryMode === 'mine';
    if (record.isDefault) {
      badge.className = 'preset-card-badge is-default';
      badge.textContent = 'DEFAULT';
    } else {
      badge.className = isMine ? 'preset-card-badge is-mine' : 'preset-card-badge is-public';
      badge.textContent = isMine ? (record.visibility === 'public' ? 'PUBLIC' : 'MINE') : 'SHARED';
    }
    top.append(heading, badge);
    const description = document.createElement('p');
    description.textContent = record.description || 'No description.';
    const author = document.createElement('small');
    author.textContent = record.isDefault
      ? 'Curated Default'
      : isMine
        ? (record.visibility === 'public' ? 'Public in Explore' : 'Private · only you')
        : `by ${record.authorName}`;
    const actions = document.createElement('div');
    actions.className = 'preset-card-actions';
    const button = (label: string, callback: () => void | Promise<void>, style = 'btn-hw-secondary') => {
      const control = document.createElement('button');
      control.className = `btn-hw ${style} btn-sm`;
      control.textContent = label;
      control.onclick = () => { void callback(); };
      actions.appendChild(control);
    };
    button('Apply', async () => {
      try {
        const preset = isMine ? await this.opts.accountManager.getOwned(record.id) : await this.opts.accountManager.getPublic(record.id);
        const applied = isMine ? record : undefined;
        this.opts.setActivePreset(preset, applied);
        document.getElementById('preset-library-modal')?.classList.add('hidden');
      } catch (error) { this.opts.onShowNotice((error as Error).message, true); }
    }, 'btn-hw-primary');
    if (!isMine) {
      if (this.opts.accountManager.userId) button('Save copy', async () => {
        try {
          const preset = await this.opts.accountManager.getPublic(record.id);
          preset.id = `user_${this.newId()}`;
          const name = prompt('Name your copy:', `${preset.name} (Copy)`);
          if (!name?.trim()) return;
          preset.name = name.trim().slice(0, 128);
          const saved = await this.opts.accountManager.save(preset);
          this.opts.onShowNotice('Private copy saved to My presets.');
          this.opts.setActivePreset(preset, saved);
        } catch (error) { this.opts.onShowNotice((error as Error).message, true); }
      });
    } else {
      button(record.visibility === 'public' ? 'Make private' : 'Share publicly', async () => {
        try {
          await this.opts.accountManager.setVisibility(record.id, record.visibility === 'public' ? 'private' : 'public');
          await this.loadPresetLibrary();
        } catch (error) { this.opts.onShowNotice((error as Error).message, true); }
      });
      button('QR link', async () => {
        await this.opts.onShowQrForHash(`#shared=${record.id}`);
        document.getElementById('preset-library-modal')?.classList.add('hidden');
      });
      button('Delete', async () => {
        if (!confirm(`Delete “${record.name}”?`)) return;
        try {
          await this.opts.accountManager.remove(record.id);
          if (this.savedPresetId === record.id) {
            this.savedPresetId = null;
            this.savedPresetOwnerId = null;
            this.updatePresetButtonsState();
          }
          await this.loadPresetLibrary();
        } catch (error) { this.opts.onShowNotice((error as Error).message, true); }
      });
    }
    card.append(top, description, author, actions);
    list.appendChild(card);
  }
}
