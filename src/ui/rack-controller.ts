// Unified Modular Hardware Rack Controller
// Serves as the base component for both Eurorack DSP and Analog Video module racks
import { FILTER_DESCRIPTORS } from '../engine/filters/factory.ts';
import { RotaryKnob } from '../components/rotary-knob.ts';
import type { FilterId, FilterNodeConfig, FilterParam, SonificationPreset } from '../types/index.ts';

export interface BaseModuleConfig {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number>;
}

export interface ModularRackOptions<TConfig extends BaseModuleConfig, TId extends string> {
  container: HTMLDivElement | null;
  emptyHint?: string;
  getModules: () => TConfig[];
  setModules: (modules: TConfig[]) => void;
  getDescriptor: (type: TId) => {
    name: string;
    category: string;
    params: FilterParam[];
  } | undefined;
  categoryShortNames: Record<string, string>;
  createDefaultModule: (type: TId) => TConfig;
  onRequestRender: () => void;
}

export class ModularRackController<TConfig extends BaseModuleConfig, TId extends string> {
  protected container: HTMLDivElement | null;
  protected dragIdx: number | null = null;

  constructor(protected opts: ModularRackOptions<TConfig, TId>) {
    this.container = opts.container;
    this.render();
  }

  public render(): void {
    const container = this.container;
    if (!container) return;
    container.innerHTML = '';
    const modules = this.opts.getModules();

    if (modules.length === 0) {
      const emptyHint = document.createElement('div');
      emptyHint.className = 'rack-empty-hint';
      emptyHint.textContent = this.opts.emptyHint || '// NO MODULES ENGAGED • TAP [+] TO ADD';
      container.appendChild(emptyHint);
      return;
    }

    modules.forEach((config, idx) => {
      const desc = this.opts.getDescriptor(config.type as TId);
      const card = document.createElement('div');
      card.className = 'rack-module';

      // Drag-to-reorder: only the grip handle initiates a drag so knobs keep working.
      const grip = document.createElement('span');
      grip.className = 'module-grip';
      grip.textContent = '⠿';
      grip.title = 'Drag to reorder';
      grip.draggable = true;
      grip.addEventListener('dragstart', (e) => {
        this.dragIdx = idx;
        e.dataTransfer?.setData('text/plain', String(idx));
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setDragImage(card, 20, 20);
        }
        card.classList.add('is-dragging');
      });
      grip.addEventListener('dragend', () => {
        this.dragIdx = null;
        card.classList.remove('is-dragging');
        this.container?.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });
      card.addEventListener('dragover', (e) => {
        if (this.dragIdx === null) return;
        e.preventDefault();
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = this.dragIdx;
        this.dragIdx = null;
        if (from === null || from === idx) return;
        const currentList = this.opts.getModules();
        const [moved] = currentList.splice(from, 1);
        currentList.splice(idx, 0, moved);
        this.opts.setModules(currentList);
        this.render();
        this.opts.onRequestRender();
      });

      const header = document.createElement('div');
      header.className = 'module-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'module-title-group';

      const catBadge = document.createElement('span');
      const catKey = desc ? desc.category : 'distortion';
      catBadge.className = `module-cat-pill cat-${catKey}`;
      catBadge.textContent = this.opts.categoryShortNames[catKey] || catKey.toUpperCase();
      catBadge.title = `Category: ${catKey.toUpperCase()}`;

      const title = document.createElement('span');
      title.className = 'module-title-text';
      title.textContent = `${String(idx + 1).padStart(2, '0')} / ${desc ? desc.name : config.type}`;

      titleGroup.appendChild(grip);
      titleGroup.appendChild(catBadge);
      titleGroup.appendChild(title);

      const headerBtns = document.createElement('div');
      headerBtns.className = 'module-actions';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = `btn-module-toggle ${config.enabled ? 'is-active' : 'is-bypassed'}`;
      toggleBtn.textContent = config.enabled ? 'ON' : 'BYP';
      toggleBtn.title = 'Bypass or engage module';
      toggleBtn.onclick = () => {
        config.enabled = !config.enabled;
        this.render();
        this.opts.onRequestRender();
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-module-remove';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove module from rack';
      removeBtn.onclick = () => {
        const currentList = this.opts.getModules();
        currentList.splice(idx, 1);
        this.opts.setModules(currentList);
        this.render();
        this.opts.onRequestRender();
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
          const val = config.params[p.name] !== undefined ? config.params[p.name] : p.value;

          const knobTooltip = p.tooltip
            ? `${p.label}: ${p.tooltip} [Range: ${p.min} to ${p.max}]`
            : `${p.label} [Range: ${p.min} to ${p.max}]`;

          const knob = new RotaryKnob({
            min: p.min,
            max: p.max,
            step: p.step,
            value: val,
            defaultValue: p.value,
            label: p.label.split(' ')[0], // Compact label
            tooltip: knobTooltip,
            size: 34,
            onChange: (newVal) => {
              config.params[p.name] = newVal;
              this.opts.onRequestRender();
            },
          });

          paramsGrid.appendChild(knob.element);
        }

        card.appendChild(paramsGrid);
      }

      container.appendChild(card);
    });
  }

  public addFilter(type: TId): void {
    const newModule = this.opts.createDefaultModule(type);
    const list = this.opts.getModules();
    list.push(newModule);
    this.opts.setModules(list);
    this.render();
    this.opts.onRequestRender();
  }
}

export interface RackControllerOptions {
  getActivePreset: () => SonificationPreset;
  onRequestRender: () => void;
}

// Concrete Eurorack DSP Rack Controller
export class RackController extends ModularRackController<FilterNodeConfig, FilterId> {
  public static readonly CATEGORY_SHORT_NAMES: Record<string, string> = {
    dynamics: 'DYN',
    eq: 'EQ',
    delay: 'DLY',
    modulation: 'MOD',
    synth: 'SYN',
    distortion: 'DIST',
    lofi: 'LO-FI',
  };

  constructor(opts: RackControllerOptions) {
    super({
      container: document.getElementById('filter-rack-container') as HTMLDivElement,
      emptyHint: '// NO DSP MODULES ENGAGED • TAP [+] TO ADD',
      getModules: () => opts.getActivePreset().filters,
      setModules: (m) => {
        opts.getActivePreset().filters = m;
      },
      getDescriptor: (type) => FILTER_DESCRIPTORS[type],
      categoryShortNames: RackController.CATEGORY_SHORT_NAMES,
      createDefaultModule: (type) => {
        const desc = FILTER_DESCRIPTORS[type];
        const defaultParams: Record<string, number> = {};
        if (desc) {
          for (const p of desc.params) defaultParams[p.name] = p.value;
        }
        return {
          id: 'f_' + Math.random().toString(36).substring(2, 7),
          type,
          enabled: true,
          sampleRate: 44100,
          params: defaultParams,
        };
      },
      onRequestRender: opts.onRequestRender,
    });
  }
}
