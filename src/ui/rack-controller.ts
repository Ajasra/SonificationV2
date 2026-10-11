// Unified Modular Hardware Rack Controller
// Base component for the unified audio/video chain rack
import { RotaryKnob } from '../components/rotary-knob.ts';
import type { FilterParam } from '../types/index.ts';

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
  getDescriptor: (type: TId, config?: TConfig) => {
    name: string;
    category: string;
    params: FilterParam[];
  } | undefined;
  /** Optional module kind tag (e.g. 'audio' | 'video') for mixed racks; shown as a badge. */
  getKind?: (config: TConfig) => string;
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
      const desc = this.opts.getDescriptor(config.type as TId, config);
      const card = document.createElement('div');
      const kind = this.opts.getKind ? this.opts.getKind(config) : '';
      card.className = kind ? `rack-module rack-module-${kind}` : 'rack-module';

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
      if (kind) {
        const kindBadge = document.createElement('span');
        kindBadge.className = `module-kind-pill kind-${kind}`;
        kindBadge.textContent = kind === 'audio' ? 'AUD' : kind === 'video' ? 'VID' : kind.toUpperCase();
        kindBadge.title = kind === 'audio' ? 'Audio DSP module' : kind === 'video' ? 'Video module' : kind;
        titleGroup.appendChild(kindBadge);
      }
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
