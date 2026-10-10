// Filter Library Browser & Add Filter Modal Controller
import { FILTER_DESCRIPTORS } from '../engine/filters/factory.ts';
import type { FilterId } from '../types/index.ts';

export interface FilterLibraryModalOptions {
  onAddFilter: (type: FilterId) => void;
}

export class FilterLibraryModalController {
  private modal = document.getElementById('add-filter-modal') as HTMLDivElement;
  private filterLibraryList = document.getElementById('filter-library-list') as HTMLDivElement;
  private filterSearchInput = document.getElementById('filter-search-input') as HTMLInputElement | null;
  private filterSearchClear = document.getElementById('filter-search-clear') as HTMLButtonElement | null;
  private filterCategoryTabs = document.getElementById('filter-category-tabs') as HTMLDivElement | null;
  private btnClose = document.getElementById('btn-close-filter-modal') as HTMLButtonElement | null;
  private btnAddFilter = document.getElementById('btn-add-filter') as HTMLButtonElement | null;

  private activeLibraryCategory: string = 'all';
  private librarySearchQuery: string = '';

  public static readonly CATEGORY_SECTIONS: { id: string; label: string }[] = [
    { id: 'dynamics', label: 'DYNAMICS & LEVEL' },
    { id: 'eq', label: 'EQ & SPECTRAL' },
    { id: 'delay', label: 'DELAY & SPACE' },
    { id: 'modulation', label: 'MODULATION' },
    { id: 'synth', label: 'SYNTHESIS' },
    { id: 'distortion', label: 'DISTORTION' },
    { id: 'lofi', label: 'LO-FI' },
  ];

  constructor(private opts: FilterLibraryModalOptions) {
    this.bindEvents();
    this.render();
  }

  private bindEvents(): void {
    if (this.btnAddFilter) {
      this.btnAddFilter.onclick = () => {
        this.show();
        if (this.filterSearchInput) {
          setTimeout(() => this.filterSearchInput?.focus(), 100);
        }
      };
    }

    if (this.btnClose) {
      this.btnClose.onclick = () => this.hide();
    }

    if (this.filterSearchInput) {
      this.filterSearchInput.oninput = () => {
        this.librarySearchQuery = this.filterSearchInput?.value.trim().toLowerCase() || '';
        if (this.filterSearchClear) {
          this.filterSearchClear.classList.toggle('hidden', !this.librarySearchQuery);
        }
        this.render();
      };
    }

    if (this.filterSearchClear) {
      this.filterSearchClear.onclick = () => {
        if (this.filterSearchInput) {
          this.filterSearchInput.value = '';
        }
        this.librarySearchQuery = '';
        this.filterSearchClear?.classList.add('hidden');
        this.render();
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
          this.render();
        };
      });
    }
  }

  public show(): void {
    this.modal.classList.remove('hidden');
  }

  public hide(): void {
    this.modal.classList.add('hidden');
  }

  public render(): void {
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
        this.render();
      });
      return;
    }

    // Group items by category if displaying 'all' or if multiple categories match query
    const categoriesToRender = activeCat === 'all'
      ? FilterLibraryModalController.CATEGORY_SECTIONS
      : FilterLibraryModalController.CATEGORY_SECTIONS.filter((s) => s.id === activeCat);

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
          this.opts.onAddFilter(desc.id as FilterId);
          this.hide();
        };
        this.filterLibraryList.appendChild(item);
      }
    }
  }
}
