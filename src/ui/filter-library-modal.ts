// Unified Hardware Module Library Browser & Selection Modal Controller
// Supports both Eurorack Audio DSP and Analog Video Processing modules in a unified UI
import { FILTER_DESCRIPTORS } from '../engine/filters/factory.ts';
import { VIDEO_FILTER_DESCRIPTORS } from '../engine/video-filters/factory.ts';
import type { FilterId, VideoFilterId } from '../types/index.ts';

export type ModuleDomain = 'audio' | 'video';

export interface FilterLibraryModalOptions {
  onAddAudioFilter: (type: FilterId) => void;
  onAddVideoFilter: (type: VideoFilterId) => void;
}

export class FilterLibraryModalController {
  private modal = document.getElementById('add-filter-modal') as HTMLDivElement;
  private modalTitle = document.getElementById('library-modal-title') as HTMLElement | null;
  private modalSub = document.getElementById('library-modal-sub') as HTMLElement | null;
  private filterLibraryList = document.getElementById('filter-library-list') as HTMLDivElement;
  private filterSearchInput = document.getElementById('filter-search-input') as HTMLInputElement | null;
  private filterSearchClear = document.getElementById('filter-search-clear') as HTMLButtonElement | null;
  private filterCategoryTabs = document.getElementById('filter-category-tabs') as HTMLDivElement | null;
  private btnClose = document.getElementById('btn-close-filter-modal') as HTMLButtonElement | null;
  private btnAddAudioFilter = document.getElementById('btn-add-filter') as HTMLButtonElement | null;
  private btnAddVideoFilter = document.getElementById('btn-add-video-filter') as HTMLButtonElement | null;

  private activeDomain: ModuleDomain = 'audio';
  private activeLibraryCategory: string = 'all';
  private librarySearchQuery: string = '';

  public static readonly AUDIO_CATEGORIES: { id: string; label: string }[] = [
    { id: 'dynamics', label: 'DYNAMICS & LEVEL' },
    { id: 'eq', label: 'EQ & SPECTRAL' },
    { id: 'delay', label: 'DELAY & SPACE' },
    { id: 'modulation', label: 'MODULATION' },
    { id: 'synth', label: 'SYNTHESIS' },
    { id: 'distortion', label: 'DISTORTION' },
    { id: 'lofi', label: 'LO-FI' },
  ];

  public static readonly VIDEO_CATEGORIES: { id: string; label: string }[] = [
    { id: 'raster', label: 'RASTER & DEFLECTION' },
    { id: 'color', label: 'COLOR & VOLTAGE SLICE' },
    { id: 'sync', label: 'SYNC & TIMEBASE ERROR' },
    { id: 'tape', label: 'TAPE & SUBCARRIER' },
    { id: 'optic', label: 'OPTIC & PHOSPHOR' },
  ];

  constructor(private opts: FilterLibraryModalOptions) {
    this.bindEvents();
    this.renderCategoryTabs();
    this.renderList();
  }

  private bindEvents(): void {
    // Open module library modal
    if (this.btnAddAudioFilter) {
      this.btnAddAudioFilter.onclick = () => {
        this.open(this.activeDomain);
      };
    }

    if (this.btnAddVideoFilter) {
      this.btnAddVideoFilter.onclick = () => {
        this.open('video');
      };
    }

    if (this.btnClose) {
      this.btnClose.onclick = () => this.hide();
    }

    // Domain switcher tabs inside modal
    document.querySelectorAll<HTMLButtonElement>('.domain-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const domain = (btn.dataset.domain || 'audio') as ModuleDomain;
        this.setDomain(domain);
      });
    });

    if (this.filterSearchInput) {
      this.filterSearchInput.oninput = () => {
        this.librarySearchQuery = this.filterSearchInput?.value.trim().toLowerCase() || '';
        if (this.filterSearchClear) {
          this.filterSearchClear.classList.toggle('hidden', !this.librarySearchQuery);
        }
        this.renderList();
      };
    }

    if (this.filterSearchClear) {
      this.filterSearchClear.onclick = () => {
        if (this.filterSearchInput) {
          this.filterSearchInput.value = '';
        }
        this.librarySearchQuery = '';
        this.filterSearchClear?.classList.add('hidden');
        this.renderList();
        this.filterSearchInput?.focus();
      };
    }
  }

  public open(domain: ModuleDomain = 'audio'): void {
    this.setDomain(domain);
    this.show();
    if (this.filterSearchInput) {
      setTimeout(() => this.filterSearchInput?.focus(), 100);
    }
  }

  public setDomain(domain: ModuleDomain): void {
    this.activeDomain = domain;
    this.activeLibraryCategory = 'all';
    this.librarySearchQuery = '';
    if (this.filterSearchInput) {
      this.filterSearchInput.value = '';
      this.filterSearchInput.placeholder =
        domain === 'audio'
          ? 'Search DSP modules by name, category, or characteristics...'
          : 'Search analog video modules by name, category, or characteristics...';
    }
    if (this.filterSearchClear) {
      this.filterSearchClear.classList.add('hidden');
    }

    // Update modal header typography
    if (this.modalTitle) {
      this.modalTitle.textContent =
        domain === 'audio' ? 'Select DSP Hardware Module' : 'Select Analog Video Module';
    }
    if (this.modalSub) {
      this.modalSub.textContent =
        domain === 'audio'
          ? 'Eurorack Filters, Delays, Resonators & Modulation'
          : 'CRT Deflection, TBC Skew, Colorizers & Video Synthesis';
    }

    // Update active domain switcher buttons
    document.querySelectorAll<HTMLButtonElement>('.domain-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.domain === domain);
    });

    this.renderCategoryTabs();
    this.renderList();
  }

  public show(): void {
    this.modal?.classList.remove('hidden');
  }

  public hide(): void {
    this.modal?.classList.add('hidden');
  }

  private renderCategoryTabs(): void {
    if (!this.filterCategoryTabs) return;
    this.filterCategoryTabs.innerHTML = '';

    const categories =
      this.activeDomain === 'audio'
        ? FilterLibraryModalController.AUDIO_CATEGORIES
        : FilterLibraryModalController.VIDEO_CATEGORIES;

    // ALL tab
    const allBtn = document.createElement('button');
    allBtn.className = `filter-cat-btn ${this.activeLibraryCategory === 'all' ? 'active' : ''}`;
    allBtn.dataset.cat = 'all';
    allBtn.textContent = 'ALL';
    allBtn.onclick = () => {
      this.filterCategoryTabs?.querySelectorAll('.filter-cat-btn').forEach((b) => b.classList.remove('active'));
      allBtn.classList.add('active');
      this.activeLibraryCategory = 'all';
      this.renderList();
    };
    this.filterCategoryTabs.appendChild(allBtn);

    // Specific category tabs
    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.className = `filter-cat-btn ${this.activeLibraryCategory === cat.id ? 'active' : ''}`;
      btn.dataset.cat = cat.id;
      btn.textContent = cat.id.toUpperCase();
      btn.onclick = () => {
        this.filterCategoryTabs?.querySelectorAll('.filter-cat-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeLibraryCategory = cat.id;
        this.renderList();
      };
      this.filterCategoryTabs.appendChild(btn);
    }
  }

  public renderList(): void {
    if (!this.filterLibraryList) return;
    this.filterLibraryList.innerHTML = '';

    const isAudio = this.activeDomain === 'audio';
    const descriptorsList = isAudio
      ? Object.values(FILTER_DESCRIPTORS)
      : Object.values(VIDEO_FILTER_DESCRIPTORS);
    const query = this.librarySearchQuery.toLowerCase().trim();
    const activeCat = this.activeLibraryCategory;

    // Filter by search query and category
    const filteredItems = descriptorsList.filter((desc) => {
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

    if (filteredItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'library-empty-state';
      empty.innerHTML = `
        <div style="font-size: 1.6rem; margin-bottom: 8px;">🔍</div>
        <div style="color: var(--text-primary); font-weight: 600;">No ${isAudio ? 'DSP' : 'analog video'} modules found</div>
        <div style="margin-top: 4px; font-size: 0.68rem; color: var(--text-muted);">No modules matched "${query || activeCat}"</div>
        <button class="btn-hw btn-hw-secondary btn-sm" style="margin-top: 12px;" id="btn-reset-unified-library">Reset Filters</button>
      `;
      this.filterLibraryList.appendChild(empty);
      empty.querySelector('#btn-reset-unified-library')?.addEventListener('click', () => {
        if (this.filterSearchInput) this.filterSearchInput.value = '';
        this.librarySearchQuery = '';
        this.activeLibraryCategory = 'all';
        if (this.filterSearchClear) this.filterSearchClear.classList.add('hidden');
        if (this.filterCategoryTabs) {
          this.filterCategoryTabs.querySelectorAll('.filter-cat-btn').forEach((b) => {
            b.classList.toggle('active', (b as HTMLElement).dataset.cat === 'all');
          });
        }
        this.renderList();
      });
      return;
    }

    // Group items by category
    const categorySections = isAudio
      ? FilterLibraryModalController.AUDIO_CATEGORIES
      : FilterLibraryModalController.VIDEO_CATEGORIES;

    const categoriesToRender = activeCat === 'all'
      ? categorySections
      : categorySections.filter((s) => s.id === activeCat);

    for (const catSection of categoriesToRender) {
      const catItems = filteredItems.filter((item) => item.category === catSection.id);
      if (catItems.length === 0) continue;

      // Render group header
      const groupHeader = document.createElement('div');
      groupHeader.className = 'library-group-section';
      groupHeader.innerHTML = `
        <span class="library-group-title cat-${catSection.id}">[ ${catSection.label} ]</span>
        <span class="library-group-count">(${catItems.length})</span>
      `;
      this.filterLibraryList.appendChild(groupHeader);

      for (const desc of catItems) {
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
            <button class="btn-library-add" title="Add ${desc.name} to ${isAudio ? 'DSP' : 'video'} rack">+</button>
          </div>
        `;
        item.onclick = () => {
          if (isAudio) {
            this.opts.onAddAudioFilter(desc.id as FilterId);
          } else {
            this.opts.onAddVideoFilter(desc.id as VideoFilterId);
          }
          this.hide();
        };
        this.filterLibraryList.appendChild(item);
      }
    }
  }
}
